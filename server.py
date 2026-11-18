import os
import time
import random
from flask import Flask, request, jsonify
from flask_cors import CORS
from iqoptionapi.stable_api import IQ_Option
from strategies import process_catalog

app = Flask(__name__)
# Enable CORS so the local frontend can communicate with Flask
CORS(app)

# Store active connections
# email -> IQ_Option instance
active_connections = {}
mock_mode_active = {} # email -> bool

def get_interval_seconds(timeframe_str):
    if timeframe_str == 'M1' or timeframe_str == 'M1+':
        return 60
    elif timeframe_str == 'M2':
        return 120
    elif timeframe_str == 'M5':
        return 300
    elif timeframe_str == 'M15':
        return 900
    elif timeframe_str == 'M30':
        return 1800
    return 300 # Default M5

def fetch_iq_candles(api, asset, timeframe_str, days):
    """
    Fetches candles from IQ Option in chunks.
    """
    interval = get_interval_seconds(timeframe_str)
    
    # Calculate how many candles we need
    # 1 day = 86400 seconds
    seconds_needed = days * 24 * 60 * 60
    candles_needed = int(seconds_needed / interval)
    
    # Cap candles to prevent timeouts / rate limits
    # Max 150000 candles
    candles_needed = min(candles_needed, 150000)
    
    all_candles = []
    end_time = int(time.time())
    
    # We fetch in chunks of 1000
    chunk_size = 1000
    
    print(f"Fetching {candles_needed} candles for {asset} with interval {interval}s...")
    
    # We try up to 150 chunks
    for _ in range(150):
        if len(all_candles) >= candles_needed:
            break
            
        count = min(chunk_size, candles_needed - len(all_candles))
        if count <= 0:
            break
            
        try:
            candles = api.get_candles(asset, interval, count, end_time)
        except Exception as e:
            print(f"Error fetching candles for {asset}: {e}")
            break
            
        if not candles or len(candles) == 0:
            break
            
        candles = sorted(candles, key=lambda x: x['from'])
        
        # Merge candles
        all_candles = candles + all_candles
        
        # The oldest candle timestamp determines the end_time for the next chunk
        oldest_ts = candles[0]['from']
        end_time = oldest_ts - 1
        
        # Sleep slightly to prevent flooding
        time.sleep(0.05)
        
    # Remove duplicates just in case
    seen_ts = set()
    unique_candles = []
    for c in all_candles:
        if c['from'] not in seen_ts:
            seen_ts.add(c['from'])
            unique_candles.append(c)
            
    print(f"Successfully retrieved {len(unique_candles)} unique candles for {asset}.")
    return sorted(unique_candles, key=lambda x: x['from'])

def generate_mock_candles(timeframe_str, days):
    """
    Generates high-volatility mock candles for fallback simulation mode.
    """
    interval = get_interval_seconds(timeframe_str)
    seconds_needed = days * 24 * 60 * 60
    candles_needed = int(seconds_needed / interval)
    candles_needed = min(candles_needed, 150000) # Capped for simulation performance
    
    candles = []
    current_time = int(time.time())
    current_time = current_time - (current_time % interval)
    current_price = 1.1200 # Starting base price
    
    for i in range(candles_needed):
        ts = current_time - (i * interval)
        # Random price movement
        change = random.uniform(-0.0008, 0.0008)
        if abs(change) < 0.0001:
            change = 0.0001 if random.random() > 0.5 else -0.0001
            
        open_price = current_price
        close_price = open_price + change
        
        high_price = max(open_price, close_price) + random.uniform(0.0001, 0.0004)
        low_price = min(open_price, close_price) - random.uniform(0.0001, 0.0004)
        
        candles.append({
            'from': ts,
            'open': open_price,
            'close': close_price,
            'high': high_price,
            'low': low_price,
            'volume': random.randint(100, 2000)
        })
        
        current_price = open_price - change
        
    return sorted(candles, key=lambda x: x['from'])

@app.route('/api/connect', methods=['POST'])
def connect_iq():
    data = request.get_json() or {}
    email = data.get('email')
    password = data.get('password')
    account_type = data.get('account_type', 'PRACTICE')
    
    if not email or not password:
        return jsonify({'success': False, 'message': 'E-mail e senha são obrigatórios.'}), 400
        
    if email in active_connections:
        try:
            active_connections[email].close()
        except Exception:
            pass
            
    print(f"Connecting to IQ Option for email: {email} ({account_type} account)...")
    
    if email.endswith('@mock.com') or email == 'teste@gmail.com' or password == '123456':
        mock_mode_active[email] = True
        return jsonify({
            'success': True,
            'message': 'Conectado em modo de demonstração/simulado.',
            'profile': {
                'name': 'Trader Demo',
                'balance': 10000.0,
                'currency': 'USD',
                'mode': 'MOCK'
            }
        })
        
    try:
        api = IQ_Option(email, password)
        check, reason = api.connect()
        
        if check:
            active_connections[email] = api
            mock_mode_active[email] = False
            
            api.change_balance(account_type)
            
            profile = api.get_profile_ans()
            user_name = profile.get('name', 'Trader IQ')
            
            balance = api.get_balance()
            currency = api.get_currency()
            
            return jsonify({
                'success': True,
                'message': 'Conectado com sucesso à IQ Option.',
                'profile': {
                    'name': user_name,
                    'balance': balance,
                    'currency': currency,
                    'mode': 'REAL'
                }
            })
        else:
            return jsonify({
                'success': False,
                'message': f'Falha na conexão IQ Option: {reason}. Tente usar e-mail "teste@gmail.com" e senha "123456" para testar o modo simulado.',
                'reason': reason
            })
    except Exception as e:
        return jsonify({
            'success': False,
            'message': f'Erro de conexão: {str(e)}'
        })

@app.route('/api/catalog', methods=['POST'])
def catalog_signals():
    data = request.get_json() or {}
    email = data.get('email')
    assets = data.get('assets', ['EURUSD', 'AUDCAD'])
    timeframe = data.get('timeframe', 'M5')
    start_hour = data.get('start_hour', '00:00')
    end_hour = data.get('end_hour', '23:59')
    ignore_current_day = bool(data.get('ignore_current_day', False))
    strategies = data.get('strategies', ['mhi_1_minoria'])
    filter_trend = bool(data.get('filter_trend', False))
    
    if not email:
        return jsonify({'success': False, 'message': 'E-mail de autenticação é obrigatório.'}), 400

    # Robust type validation and sanitization
    try:
        days = int(data.get('days', 1))
        martingale = int(data.get('martingale', 1))
        min_winrate = float(data.get('min_winrate', 95.0))
    except (ValueError, TypeError) as e:
        return jsonify({
            'success': False, 
            'message': f'Erro de validação de dados: Parâmetros numéricos inválidos fornecidos ({str(e)}).'
        }), 400
        
    is_mock = mock_mode_active.get(email, True)
    api = active_connections.get(email)
    
    if not is_mock and api:
        if not api.check_connect():
            check, reason = api.connect()
            if not check:
                is_mock = True
                
    if not is_mock and not api:
        is_mock = True
        
    all_signals = []
    print(f"Cataloging: mock={is_mock}, assets={assets}, tf={timeframe}, days={days}, strategies={strategies}")
    
    remove_duplicates = bool(data.get('remove_duplicates', False))
    
    for asset in assets:
        if is_mock:
            clean_asset = asset.replace('/', '').replace('-', '').upper()
            candles = generate_mock_candles(timeframe, days)
        else:
            clean_asset = asset.replace('/', '').replace('-', '').upper()
            candles = fetch_iq_candles(api, clean_asset, timeframe, days)
            
        if not candles:
            continue
            
        signals = process_catalog(
            candles=candles,
            timeframe_minutes=get_interval_seconds(timeframe) // 60,
            selected_strategies=strategies,
            max_martingale=martingale,
            min_winrate=min_winrate,
            start_hour_str=start_hour,
            end_hour_str=end_hour,
            ignore_current_day=ignore_current_day,
            filter_trend=filter_trend
        )
        
        for s in signals:
            s['asset'] = asset
            
        all_signals.extend(signals)
        
    # Remove duplicate signals at the exact same hour if remove_duplicates option is enabled
    # We group by (time, asset) or just (time) depending on preference, but usually "remover sinais iguais"
    # means avoiding multiple signals at the EXACT same time (e.g. at 10:03). Let's group by (time, asset)
    # to allow different assets at the same time, OR if it means globally avoiding same hour, let's group by time.
    # The user screenshot showed 10:03 AUD/CAD Três Mosqueteiros (PUT) multiple times.
    # Grouping by (time, asset, direction) or just (time, asset) makes the most sense.
    # Let's filter unique (time, asset) signals, keeping the one with the highest winrate.
    if remove_duplicates:
        unique_signals = {}
        for s in all_signals:
            key = (s['time'], s['asset'])
            if key not in unique_signals or s['winrate'] > unique_signals[key]['winrate']:
                unique_signals[key] = s
        all_signals = list(unique_signals.values())
        
    all_signals = sorted(all_signals, key=lambda x: (x['time'], x['asset']))
    time.sleep(1.0)
    
    return jsonify({
        'success': True,
        'signals': all_signals,
        'mode': 'MOCK' if is_mock else 'REAL'
    })

@app.route('/api/status', methods=['GET'])
def check_status():
    email = request.args.get('email')
    if not email:
        return jsonify({'connected': False, 'message': 'E-mail não informado.'})
        
    is_mock = mock_mode_active.get(email, True)
    if is_mock:
        return jsonify({
            'connected': True,
            'mode': 'MOCK',
            'profile': {
                'name': 'Trader Demo',
                'balance': 10000.0,
                'currency': 'USD'
            }
        })
        
    api = active_connections.get(email)
    if api and api.check_connect():
        balance = api.get_balance()
        return jsonify({
            'connected': True,
            'mode': 'REAL',
            'profile': {
                'name': api.get_profile_ans().get('name', 'Trader IQ'),
                'balance': balance,
                'currency': api.get_currency()
            }
        })
    else:
        return jsonify({'connected': False, 'mode': 'DISCONNECTED'})

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)
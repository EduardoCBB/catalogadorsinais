import time
from datetime import datetime, timezone, timedelta

def get_candle_color(candle):
    if not candle:
        return 'D' # Doji / Missing
    o = candle.get('open', 0)
    c = candle.get('close', 0)
    if c > o:
        return 'G' # Green (CALL)
    elif c < o:
        return 'R' # Red (PUT)
    else:
        return 'D' # Doji (Neutral)

def check_trend_alignment(entry_ts, signal_dir, candle_by_ts, candle_duration):
    """
    Checks if signal direction aligns with the trend using SMA 20 of close prices.
    Bullish trend (Close > SMA 20) -> CALL only.
    Bearish trend (Close < SMA 20) -> PUT only.
    """
    closes = []
    # Gather closes of last 20 candles before entry_ts
    for i in range(1, 21):
        prev_ts = entry_ts - (i * candle_duration)
        prev_c = candle_by_ts.get(prev_ts)
        if prev_c:
            closes.append(prev_c.get('close', 0))
            
    if len(closes) < 10:
        # Not enough history to verify trend, allow the signal
        return True
        
    sma = sum(closes) / len(closes)
    # The last candle close before entry
    last_close = candle_by_ts.get(entry_ts - candle_duration, {}).get('close', 0)
    
    if last_close > sma:
        trend = 'CALL'
    elif last_close < sma:
        trend = 'PUT'
    else:
        trend = 'NEUTRAL'
        
    return trend == 'NEUTRAL' or signal_dir == trend

def process_catalog(candles, timeframe_minutes, selected_strategies, max_martingale, min_winrate, start_hour_str, end_hour_str, ignore_current_day, filter_trend=False):
    """
    Processes candles and catalogs signals according to the parameters.
    """
    if not candles:
        return []
    
    # Sort candles by timestamp
    candles = sorted(candles, key=lambda x: x['from'])
    
    candle_duration = timeframe_minutes * 60
    candle_by_ts = {c['from']: c for c in candles}
    
    # Define cycle size (M1: 5 candles = 300s, M5: 5 candles = 1500s, M15: 5 candles = 4500s)
    cycle_duration = candle_duration * 5
    
    # Group candles by cycles
    # To be extremely accurate, cycles start at multiples of cycle_duration
    cycles = {}
    for c in candles:
        ts = c['from']
        cycle_start = ts - (ts % cycle_duration)
        if cycle_start not in cycles:
            cycles[cycle_start] = []
        cycles[cycle_start].append(c)
        
    # We want to process each cycle and check if it generates a signal
    # Let's list the cycles in chronological order
    sorted_cycle_starts = sorted(cycles.keys())
    
    # Time limits formatting
    try:
        sh, sm = map(int, start_hour_str.split(':'))
        eh, em = map(int, end_hour_str.split(':'))
    except Exception:
        sh, sm = 0, 0
        eh, em = 23, 59

    # Storage for strategy statistics
    stats = {strat: {
        'wins_g0': 0,
        'wins_g1': 0,
        'wins_g2': 0,
        'wins_g3': 0,
        'wins_g4': 0,
        'losses': 0,
        'signals': []
    } for strat in selected_strategies}
    
    # Let's analyze cycle by cycle
    for i, cycle_start in enumerate(sorted_cycle_starts):
        cycle_candles = sorted(cycles[cycle_start], key=lambda x: x['from'])
        
        # Check if we have all 5 candles of the cycle to avoid incomplete analysis
        full_cycle_candles = []
        for idx in range(5):
            expected_ts = cycle_start + (idx * candle_duration)
            full_cycle_candles.append(candle_by_ts.get(expected_ts, {'from': expected_ts, 'open': 0, 'close': 0}))
            
        colors = [get_candle_color(c) for c in full_cycle_candles]
        
        # Datetime of cycle start in BRT (UTC-3)
        dt_brt = datetime.fromtimestamp(cycle_start, timezone.utc) - timedelta(hours=3)
        
        # Filter: Ignore current day if checked
        if ignore_current_day:
            today_brt = datetime.now(timezone.utc) - timedelta(hours=3)
            if dt_brt.date() == today_brt.date():
                continue
                
        # Filter: Hour interval check
        cycle_time = dt_brt.time()
        start_time_limit = datetime.strptime(f"{sh:02d}:{sm:02d}", "%H:%M").time()
        end_time_limit = datetime.strptime(f"{eh:02d}:{em:02d}", "%H:%M").time()
        
        # Check if time fits interval
        if start_time_limit <= end_time_limit:
            if not (start_time_limit <= cycle_time <= end_time_limit):
                continue
        else: # interval spans midnight (e.g. 22h to 02h)
            if not (cycle_time >= start_time_limit or cycle_time <= end_time_limit):
                continue

        # Check strategies
        for strat in selected_strategies:
            signal_dir = None
            entry_ts = None
            
            # --- STRATEGY LOGIC ---
            if strat.startswith('mhi_1'):
                # MHI 1: Look at the last 3 candles of current cycle (indices 2, 3, 4)
                # Entry is on the 1st candle of the NEXT cycle
                last_3_colors = colors[2:5]
                g_count = last_3_colors.count('G')
                r_count = last_3_colors.count('R')
                
                if g_count != r_count:
                    is_minority_green = g_count < r_count
                    if 'mhi_1_minoria' in strat:
                        signal_dir = 'CALL' if is_minority_green else 'PUT'
                    elif 'mhi_1_maioria' in strat:
                        signal_dir = 'PUT' if is_minority_green else 'CALL'
                        
                entry_ts = cycle_start + cycle_duration # 1st candle of next cycle
                
            elif strat.startswith('mhi_2'):
                # MHI 2: Look at last 3 candles of current cycle
                # Entry is on the 2nd candle of the NEXT cycle
                last_3_colors = colors[2:5]
                g_count = last_3_colors.count('G')
                r_count = last_3_colors.count('R')
                
                if g_count != r_count:
                    is_minority_green = g_count < r_count
                    if 'mhi_2_minoria' in strat:
                        signal_dir = 'CALL' if is_minority_green else 'PUT'
                    elif 'mhi_2_maioria' in strat:
                        signal_dir = 'PUT' if is_minority_green else 'CALL'
                        
                entry_ts = cycle_start + cycle_duration + candle_duration # 2nd candle of next cycle
                
            elif strat.startswith('mhi_3'):
                # MHI 3: Look at last 3 candles of current cycle
                # Entry is on the 3rd candle of the NEXT cycle
                last_3_colors = colors[2:5]
                g_count = last_3_colors.count('G')
                r_count = last_3_colors.count('R')
                
                if g_count != r_count:
                    is_minority_green = g_count < r_count
                    if 'mhi_3_minoria' in strat:
                        signal_dir = 'CALL' if is_minority_green else 'PUT'
                    elif 'mhi_3_maioria' in strat:
                        signal_dir = 'PUT' if is_minority_green else 'CALL'
                        
                entry_ts = cycle_start + cycle_duration + (2 * candle_duration) # 3rd candle of next cycle
                
            elif strat == 'torre_gemea':
                # Torre Gêmea: 1st candle of cycle (index 0). Entry on 5th candle (index 4) of SAME cycle.
                # Bet is for SAME color.
                c1_color = colors[0]
                if c1_color in ['G', 'R']:
                    signal_dir = 'CALL' if c1_color == 'G' else 'PUT'
                    entry_ts = cycle_start + (4 * candle_duration) # 5th candle of same cycle
                    
            elif strat == 'tres_mosqueteiros':
                # Três Mosqueteiros: 1st, 2nd, 3rd candles are same color. Entry on 4th candle (index 3).
                # Bet is for CONTINUATION (same color).
                c1, c2, c3 = colors[0], colors[1], colors[2]
                if c1 == c2 == c3 and c1 in ['G', 'R']:
                    signal_dir = 'CALL' if c1 == 'G' else 'PUT'
                    entry_ts = cycle_start + (3 * candle_duration) # 4th candle of same cycle

            # Verify signal outcome if signal is generated
            if signal_dir and entry_ts:
                # --- TREND FILTER ANALYSIS ---
                if filter_trend:
                    # If signal doesn't match graphic trend, discard it
                    if not check_trend_alignment(entry_ts, signal_dir, candle_by_ts, candle_duration):
                        continue

                result = None
                
                # Check G0 (1st entry)
                c_g0 = candle_by_ts.get(entry_ts)
                c_g0_color = get_candle_color(c_g0)
                
                expected_color = 'G' if signal_dir == 'CALL' else 'R'
                
                if c_g0_color == expected_color:
                    result = 'WIN_G0'
                else:
                    # G0 lost, check Martingale loop dynamically
                    result = 'LOSS'
                    for g in range(1, max_martingale + 1):
                        c_g = candle_by_ts.get(entry_ts + (g * candle_duration))
                        c_g_color = get_candle_color(c_g)
                        if c_g_color == expected_color:
                            result = f'WIN_G{g}'
                            break
                
                # If we don't have the entry candle in history yet (e.g. it is in the future),
                # mark as PENDING.
                if entry_ts not in candle_by_ts:
                    result = 'PENDING'
                
                # Update statistics (only if not pending)
                if result != 'PENDING':
                    if result.startswith('WIN_G'):
                        key = result.lower().replace('win_', 'wins_')
                        stats[strat][key] += 1
                    elif result == 'LOSS':
                        stats[strat]['losses'] += 1
                        
                    # Save signal details
                    signal_dt_brt = datetime.fromtimestamp(entry_ts, timezone.utc) - timedelta(hours=3)
                    time_str = signal_dt_brt.strftime('%H:%M')
                    date_str = signal_dt_brt.strftime('%Y-%m-%d')
                    
                    stats[strat]['signals'].append({
                        'time': time_str,
                        'date': date_str,
                        'direction': signal_dir,
                        'result': result,
                        'timestamp': entry_ts
                    })

    # Compile the final catalog list
    final_signals = []
    
    for strat, data in stats.items():
        total_wins = data['wins_g0']
        for g in range(1, max_martingale + 1):
            total_wins += data.get(f'wins_g{g}', 0)
            
        total_signals = total_wins + data['losses']
        
        if total_signals > 0:
            winrate = (total_wins / total_signals) * 100
        else:
            winrate = 0.0
            
        # Only list if it satisfies the minimum winrate
        if winrate >= min_winrate:
            for sig in data['signals']:
                # Construct Gale stats string dynamically
                gale_details = [f"G0: {data['wins_g0']}"]
                for g in range(1, max_martingale + 1):
                    gale_details.append(f"G{g}: {data.get(f'wins_g{g}', 0)}")
                gale_str = ", ".join(gale_details)
                
                final_signals.append({
                    'strategy': strat,
                    'time': sig['time'],
                    'date': sig['date'],
                    'direction': sig['direction'],
                    'result': sig['result'],
                    'winrate': round(winrate, 1),
                    'total_wins': total_wins,
                    'total_losses': data['losses'],
                    'stats_str': f"{total_wins}x{data['losses']} ({gale_str})",
                    'timestamp': sig['timestamp']
                })
                
    # Sort final signals by time
    final_signals = sorted(final_signals, key=lambda x: (x['time'], x['strategy']))
    return final_signals

/**
 * QUANTUM CATALOG - Signal Cataloger App
 * Core Application Logic
 */

document.addEventListener('DOMContentLoaded', () => {
    // --- State Variables ---
    let selectedTimeframe = 'M1+';
    let selectedDirection = 'CALL';
    let selectedAssets = ['EUR/GBP'];
    let catalogedSignals = [];
    let savedPresets = [
        { name: 'M1 - 12d', timeframe: 'M1', direction: 'CALL/PUT', assets: ['EUR/USD', 'GBP/USD'], percentage: '95', dias: '15', martingale: '1', otc: true, removeEquals: true, ignoreToday: true, nextDay: false, news: false },
        { name: 'M5 - 10d', timeframe: 'M5', direction: 'CALL', assets: ['EUR/GBP'], percentage: '100', dias: '10', martingale: '2', otc: false, removeEquals: true, ignoreToday: true, nextDay: false, news: false },
        { name: 'M15 - 7d', timeframe: 'M15', direction: 'PUT', assets: ['EUR/GBP', 'GBP/USD'], percentage: '95', dias: '7', martingale: '1', otc: true, removeEquals: false, ignoreToday: true, nextDay: true, news: true }
    ];

    // --- DOM Elements ---
    const timeframeButtons = document.querySelectorAll('#timeframeGroup .btn-toggle');
    const directionButtons = document.querySelectorAll('#directionGroup .btn-toggle');
    
    const btnAssetDropdown = document.getElementById('btnAssetDropdown');
    const assetsDropdownList = document.getElementById('assetsDropdownList');
    const selectedAssetsContainer = document.getElementById('selectedAssets');
    const assetsDropdownItems = document.querySelectorAll('#assetsDropdownList .dropdown-item');
    
    const percentageSelect = document.getElementById('porcentagemSelect');
    const diasSelect = document.getElementById('diasSelect');
    const martingaleSelect = document.getElementById('martingaleSelect');
    const estrategiaSelect = document.getElementById('estrategiaSelect');
    
    const startHourInput = document.getElementById('startHour');
    const startMinuteInput = document.getElementById('startMinute');
    const endHourInput = document.getElementById('endHour');
    const endMinuteInput = document.getElementById('endMinute');
    
    const chkOtc = document.getElementById('chkOtc');
    const chkRemoveEquals = document.getElementById('chkRemoveEquals');
    const chkIgnoreToday = document.getElementById('chkIgnoreToday');
    const chkNextDay = document.getElementById('chkNextDay');
    
    const newsSwitch = document.getElementById('newsSwitch');
    const newsConfigArea = document.getElementById('newsConfigArea');
    const impactButtons = document.querySelectorAll('.btn-impact');
    const newsMinutesInput = document.getElementById('newsMinutes');
    
    const btnStart = document.getElementById('btnStart');
    const signalsCountBadge = document.getElementById('signalsCountBadge');
    
    const statAssertividade = document.getElementById('statAssertividade');
    const statTotalSinais = document.getElementById('statTotalSinais');
    const statGaleDistribution = document.getElementById('statGaleDistribution');
    
    const catalogDescription = document.getElementById('catalogDescription');
    const signalsTableBody = document.getElementById('signalsTableBody');
    const noSignalsMessage = document.getElementById('noSignalsMessage');
    
    const btnCopyText = document.getElementById('btnCopyText');
    const btnExportCsv = document.getElementById('btnExportCsv');
    const copyToast = document.getElementById('copyToast');
    const presetsListContainer = document.getElementById('presetsList');
    const btnSavePreset = document.getElementById('btnSavePreset');

    // --- Loaded Presets Init ---
    function loadSavedPresets() {
        const local = localStorage.getItem('quantum_presets');
        if (local) {
            savedPresets = JSON.parse(local);
        }
        renderPresets();
    }

    function renderPresets() {
        // Clear all except the "Salvar" button
        const buttons = presetsListContainer.querySelectorAll('.preset-tag');
        buttons.forEach(b => b.remove());

        savedPresets.forEach(preset => {
            const btn = document.createElement('button');
            btn.className = 'preset-tag';
            btn.textContent = preset.name;
            btn.addEventListener('click', () => applyPreset(preset));
            presetsListContainer.insertBefore(btn, btnSavePreset);
        });
    }

    function applyPreset(preset) {
        // Remove active class from presets
        presetsListContainer.querySelectorAll('.preset-tag').forEach(b => b.classList.remove('active'));
        // Find and highlight this preset button
        const presetButtons = presetsListContainer.querySelectorAll('.preset-tag');
        presetButtons.forEach(btn => {
            if (btn.textContent === preset.name) btn.classList.add('active');
        });

        // Set timeframe
        selectedTimeframe = preset.timeframe;
        timeframeButtons.forEach(b => {
            b.classList.toggle('active', b.getAttribute('data-value') === selectedTimeframe);
        });

        // Set direction
        selectedDirection = preset.direction;
        directionButtons.forEach(b => {
            b.classList.toggle('active', b.getAttribute('data-value') === selectedDirection);
        });

        // Set assets
        selectedAssets = [...preset.assets];
        renderAssetPills();
        updateDropdownSelections();

        // Set selectors
        percentageSelect.value = preset.percentage;
        diasSelect.value = preset.dias;
        martingaleSelect.value = preset.martingale;

        // Set checkboxes
        chkOtc.checked = preset.otc;
        chkRemoveEquals.checked = preset.removeEquals;
        chkIgnoreToday.checked = preset.ignoreToday;
        chkNextDay.checked = preset.nextDay;

        // Set news
        newsSwitch.checked = preset.news;
        if (preset.news) {
            newsConfigArea.classList.remove('hidden');
        } else {
            newsConfigArea.classList.add('hidden');
        }

        runCataloging();
    }

    // --- Assets Dropdown Logic ---
    const assetSearchInput = document.getElementById('assetSearchInput');
    const btnSelectAllAssets = document.getElementById('btnSelectAllAssets');
    const btnClearAllAssets = document.getElementById('btnClearAllAssets');

    btnAssetDropdown.addEventListener('click', (e) => {
        e.stopPropagation();
        assetsDropdownList.classList.toggle('hidden');
        if (!assetsDropdownList.classList.contains('hidden') && assetSearchInput) {
            assetSearchInput.focus();
        }
    });

    document.addEventListener('click', (e) => {
        if (!e.target.closest('#assetsSelectContainer')) {
            assetsDropdownList.classList.add('hidden');
        }
    });

    // Search filter inside asset dropdown
    if (assetSearchInput) {
        assetSearchInput.addEventListener('input', (e) => {
            const query = e.target.value.toLowerCase().trim();
            const items = assetsDropdownList.querySelectorAll('.dropdown-item');
            items.forEach(item => {
                const text = item.textContent.toLowerCase();
                const val = (item.getAttribute('data-value') || '').toLowerCase();
                const matches = text.includes(query) || val.includes(query);
                item.style.display = matches ? 'block' : 'none';
            });
        });

        assetSearchInput.addEventListener('click', (e) => {
            e.stopPropagation();
        });
    }

    // Select All / Deselect All
    if (btnSelectAllAssets) {
        btnSelectAllAssets.addEventListener('click', (e) => {
            e.stopPropagation();
            const visibleItems = assetsDropdownList.querySelectorAll('.dropdown-item');
            visibleItems.forEach(item => {
                if (item.style.display !== 'none') {
                    const val = item.getAttribute('data-value');
                    if (val && !selectedAssets.includes(val)) {
                        selectedAssets.push(val);
                    }
                }
            });
            renderAssetPills();
            updateDropdownSelections();
        });
    }

    if (btnClearAllAssets) {
        btnClearAllAssets.addEventListener('click', (e) => {
            e.stopPropagation();
            selectedAssets = [];
            renderAssetPills();
            updateDropdownSelections();
        });
    }

    function renderAssetPills() {
        selectedAssetsContainer.innerHTML = '';
        selectedAssets.forEach(asset => {
            const pill = document.createElement('span');
            pill.className = 'asset-tag-pill';
            pill.innerHTML = `
                ${asset}
                <span class="remove-tag" data-asset="${asset}">&times;</span>
            `;
            pill.querySelector('.remove-tag').addEventListener('click', (e) => {
                e.stopPropagation();
                removeAsset(asset);
            });
            selectedAssetsContainer.appendChild(pill);
        });
    }

    function updateDropdownSelections() {
        const items = assetsDropdownList.querySelectorAll('.dropdown-item');
        items.forEach(item => {
            const val = item.getAttribute('data-value');
            item.classList.toggle('selected', selectedAssets.includes(val));
        });
    }

    function addAsset(asset) {
        if (!selectedAssets.includes(asset)) {
            selectedAssets.push(asset);
            renderAssetPills();
            updateDropdownSelections();
        }
    }

    function removeAsset(asset) {
        selectedAssets = selectedAssets.filter(a => a !== asset);
        renderAssetPills();
        updateDropdownSelections();
    }

    assetsDropdownList.addEventListener('click', (e) => {
        const item = e.target.closest('.dropdown-item');
        if (item) {
            e.stopPropagation();
            const val = item.getAttribute('data-value');
            if (val) {
                if (selectedAssets.includes(val)) {
                    removeAsset(val);
                } else {
                    addAsset(val);
                }
            }
        }
    });

    // --- Timeframe Buttons ---
    timeframeButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            timeframeButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            selectedTimeframe = btn.getAttribute('data-value');
        });
    });

    // --- Direction Buttons ---
    directionButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            directionButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            selectedDirection = btn.getAttribute('data-value');
        });
    });

    // --- News Switch Toggle ---
    newsSwitch.addEventListener('change', () => {
        newsConfigArea.classList.toggle('hidden', !newsSwitch.checked);
    });

    impactButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            btn.classList.toggle('active');
        });
    });

    // --- Preset Creation ---
    btnSavePreset.addEventListener('click', () => {
        const name = prompt('Digite o nome do preset (ex: M5 - 15 dias):');
        if (!name) return;

        const newPreset = {
            name: name,
            timeframe: selectedTimeframe,
            direction: selectedDirection,
            assets: [...selectedAssets],
            percentage: percentageSelect.value,
            dias: diasSelect.value,
            martingale: martingaleSelect.value,
            otc: chkOtc.checked,
            removeEquals: chkRemoveEquals.checked,
            ignoreToday: chkIgnoreToday.checked,
            nextDay: chkNextDay.checked,
            news: newsSwitch.checked
        };

        savedPresets.push(newPreset);
        localStorage.setItem('quantum_presets', JSON.stringify(savedPresets));
        renderPresets();
        showToast('Preset salvo com sucesso!');
    });

    // --- Core Cataloger / Signal Generation Algorithmic Engine ---
    let currentSignals = [];

    function seedRandom(seed) {
        let x = Math.sin(seed++) * 10000;
        return x - Math.floor(x);
    }

    // Deterministic candle simulator based on asset, day, and time
    function getCandle(asset, day, minuteIndex) {
        let assetCode = asset.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
        let seed = assetCode + day * 1440 + minuteIndex;
        let r = seedRandom(seed);
        
        // 49.5% Green, 49.5% Red, 1% Doji (Grey tie)
        let color = "doji";
        if (r < 0.495) color = "green";
        else if (r < 0.99) color = "red";
        
        // Bollinger Break / RSI trigger simulation (~7% rate)
        let bbBreak = null;
        if (r < 0.035) bbBreak = "down"; // oversold/lower band break
        else if (r > 0.965) bbBreak = "up";   // overbought/upper band break
        
        // Support/Resistance touch (~8% rate)
        let srTouch = null;
        if (r > 0.05 && r < 0.09) srTouch = "support";
        else if (r > 0.91 && r < 0.95) srTouch = "resistance";

        // Simulated candle patterns for Price Action
        let pattern = null;
        if (r > 0.15 && r < 0.18) pattern = "pinbar_bullish";
        else if (r > 0.82 && r < 0.85) pattern = "pinbar_bearish";
        else if (r > 0.25 && r < 0.28) pattern = "engulfing_bullish";
        else if (r > 0.72 && r < 0.75) pattern = "engulfing_bearish";
        
        return { color, bbBreak, srTouch, pattern };
    }

    // Trade strategy detector
    function checkStrategy(asset, day, minuteIndex, strategy) {
        // MHI works specifically on 5-minute cycles (trades on :00, :05, :10...)
        if (strategy === "mhi_minoria" || strategy === "mhi_maioria") {
            if (minuteIndex % 5 !== 0) return { trigger: false };
            
            // Analyze the last 3 candles of the previous 5-minute block
            // Ex: for 18:05, check 18:02, 18:03, 18:04
            let c1 = getCandle(asset, day, minuteIndex - 3);
            let c2 = getCandle(asset, day, minuteIndex - 2);
            let c3 = getCandle(asset, day, minuteIndex - 1);
            
            let greenCount = 0;
            let redCount = 0;
            [c1, c2, c3].forEach(c => {
                if (c.color === "green") greenCount++;
                if (c.color === "red") redCount++;
            });
            
            if (greenCount === 0 && redCount === 0) return { trigger: false }; // Tie/Dojis
            
            let direction = "";
            if (strategy === "mhi_minoria") {
                direction = greenCount < redCount ? "CALL" : "PUT";
            } else {
                direction = greenCount > redCount ? "CALL" : "PUT";
            }
            
            return { trigger: true, direction };
        }
        else if (strategy === "mean_reversion") {
            // BB + RSI Reversion: Check if previous candle broke BB
            let c = getCandle(asset, day, minuteIndex - 1);
            if (c.bbBreak === "down") {
                return { trigger: true, direction: "CALL" };
            } else if (c.bbBreak === "up") {
                return { trigger: true, direction: "PUT" };
            }
            return { trigger: false };
        }
        else if (strategy === "trend_following") {
            // Enhanced Trend Following: Dual SMA (SMA 7 Fast + SMA 21 Slow) + Momentum & Volatility Confirmation
            let greenFast = 0;
            let redFast = 0;
            for (let i = 1; i <= 7; i++) {
                let c = getCandle(asset, day, minuteIndex - i);
                if (c.color === "green") greenFast++;
                else if (c.color === "red") redFast++;
            }

            let greenSlow = 0;
            let redSlow = 0;
            for (let i = 1; i <= 21; i++) {
                let c = getCandle(asset, day, minuteIndex - i);
                if (c.color === "green") greenSlow++;
                else if (c.color === "red") redSlow++;
            }

            // Dual SMA alignment condition
            let isBullishTrend = (greenFast >= 5) && (greenSlow >= 13);
            let isBearishTrend = (redFast >= 5) && (redSlow >= 13);

            let cPrev1 = getCandle(asset, day, minuteIndex - 1);
            let cPrev2 = getCandle(asset, day, minuteIndex - 2);

            // Avoid lateral consolidation / Doji ties
            if (cPrev1.color === "doji" || cPrev2.color === "doji") {
                return { trigger: false };
            }

            // CALL Trigger: Strong bullish trend + last candle confirmed green + no bearish pinbar
            if (isBullishTrend && cPrev1.color === "green" && cPrev1.pattern !== "pinbar_bearish") {
                return { trigger: true, direction: "CALL" };
            }
            // PUT Trigger: Strong bearish trend + last candle confirmed red + no bullish pinbar
            else if (isBearishTrend && cPrev1.color === "red" && cPrev1.pattern !== "pinbar_bullish") {
                return { trigger: true, direction: "PUT" };
            }

            return { trigger: false };
        }
        else if (strategy === "price_action") {
            // Price Action (Pin Bar & Engulfing Reversals)
            let c = getCandle(asset, day, minuteIndex - 1);
            if (c.pattern === "pinbar_bullish" || c.pattern === "engulfing_bullish") {
                return { trigger: true, direction: "CALL" };
            } else if (c.pattern === "pinbar_bearish" || c.pattern === "engulfing_bearish") {
                return { trigger: true, direction: "PUT" };
            }
            return { trigger: false };
        }
        else if (strategy === "breakout") {
            // Rompimento (Breakout Trading)
            let c = getCandle(asset, day, minuteIndex - 1);
            if (c.srTouch === "support" && c.color === "red") {
                return { trigger: true, direction: "PUT" };
            } else if (c.srTouch === "resistance" && c.color === "green") {
                return { trigger: true, direction: "CALL" };
            }
            return { trigger: false };
        }
        else if (strategy === "pullback") {
            // Pullback: In overall trend, wait for opposite color candle to enter trend direction
            let greenCount = 0;
            for (let i = 1; i <= 10; i++) {
                if (getCandle(asset, day, minuteIndex - i).color === "green") {
                    greenCount++;
                }
            }
            let isBullishTrend = greenCount > 5;
            let prevCandle = getCandle(asset, day, minuteIndex - 1);
            if (isBullishTrend && prevCandle.color === "red") {
                return { trigger: true, direction: "CALL" };
            } else if (!isBullishTrend && prevCandle.color === "green") {
                return { trigger: true, direction: "PUT" };
            }
            return { trigger: false };
        }
        return { trigger: false };
    }

    // Evaluates outcomes based on actual candles
    function evaluateTrade(asset, day, entryMinute, direction, maxGales) {
        const targetColor = direction === "CALL" ? "green" : "red";
        
        for (let g = 0; g <= maxGales; g++) {
            let candle = getCandle(asset, day, entryMinute + g);
            if (candle.color === targetColor) {
                return {
                    outcome: g === 0 ? "win_direct" : "win_gale",
                    galeUsed: g
                };
            }
        }
        return { outcome: "loss", galeUsed: maxGales };
    }

    function generateSignals() {
        const minAssert = parseInt(percentageSelect.value);
        const maxGales = parseInt(martingaleSelect.value);
        const startH = parseInt(startHourInput.value);
        const startM = parseInt(startMinuteInput.value);
        const endH = parseInt(endHourInput.value);
        const endM = parseInt(endMinuteInput.value);
        const strategy = estrategiaSelect.value;
        const totalDays = parseInt(diasSelect.value);
        const ignoreToday = chkIgnoreToday.checked;
        
        let startTotalMinutes = startH * 60 + startM;
        let endTotalMinutes = endH * 60 + endM;
        
        if (endTotalMinutes < startTotalMinutes) {
            endTotalMinutes += 24 * 60; // Over midnight
        }

        let generated = [];

        // Loop over selected assets
        selectedAssets.forEach(asset => {
            if (asset.includes('OTC') && !chkOtc.checked) return;

            // Loop through selected hours interval
            for (let minOffset = startTotalMinutes; minOffset <= endTotalMinutes; minOffset++) {
                let currentTotalMin = minOffset % (24 * 60);
                let hour = Math.floor(currentTotalMin / 60);
                let minute = currentTotalMin % 60;
                let timeStr = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;

                // Check strategy trigger
                let triggerCount = 0;
                let winCount = 0;
                let direction = "";
                let galeDistribution = [0, 0, 0, 0, 0]; // direct, g1, g2, g3, g4
                
                // Calculate success rate over N days
                let startDay = ignoreToday ? 1 : 0;
                for (let d = startDay; d < startDay + totalDays; d++) {
                    let analysis = checkStrategy(asset, d, currentTotalMin, strategy);
                    if (analysis.trigger) {
                        triggerCount++;
                        direction = analysis.direction;
                        let trade = evaluateTrade(asset, d, currentTotalMin, direction, maxGales);
                        if (trade.outcome !== "loss") {
                            winCount++;
                            galeDistribution[trade.galeUsed]++;
                        }
                    }
                }

                // If strategy triggered on this time slot historically
                if (triggerCount > 0) {
                    let successRate = Math.round((winCount / triggerCount) * 100);
                    
                    if (successRate >= minAssert && (selectedDirection === 'CALL/PUT' || selectedDirection === direction)) {
                        // Find most common winning gale
                        let recommendedGale = 0;
                        let maxCount = -1;
                        for (let g = 0; g <= maxGales; g++) {
                            if (galeDistribution[g] > maxCount) {
                                maxCount = galeDistribution[g];
                                recommendedGale = g;
                            }
                        }

                        generated.push({
                            time: timeStr,
                            rawMin: currentTotalMin,
                            asset: asset,
                            timeframe: selectedTimeframe,
                            direction: direction,
                            assertiveness: successRate,
                            gale: recommendedGale
                        });
                    }
                }
            }
        });

        // "Remover horários iguais" Logic
        if (chkRemoveEquals.checked) {
            let uniqueSignals = {};
            generated.forEach(sig => {
                let key = `${sig.time}`;
                if (!uniqueSignals[key] || sig.assertiveness > uniqueSignals[key].assertiveness) {
                    uniqueSignals[key] = sig;
                }
            });
            generated = Object.values(uniqueSignals);
        }

        // Sort signals by time
        generated.sort((a, b) => a.rawMin - b.rawMin);

        return generated;
    }

    function runCataloging() {
        btnStart.classList.add('loading');
        btnStart.style.opacity = '0.7';

        // Simulate calculation time/delay for UX realism
        setTimeout(() => {
            currentSignals = generateSignals();
            catalogedSignals = [...currentSignals];
            
            // Update UI
            renderSignalsTable();
            updateStatsDashboard();
            
            btnStart.classList.remove('loading');
            btnStart.style.opacity = '1';
            signalsCountBadge.textContent = currentSignals.length;

            // Description text
            catalogDescription.textContent = `Catalogação de ${diasSelect.value} dias históricos para ${selectedAssets.join(', ')} no timeframe ${selectedTimeframe}`;
        }, 400);
    }

    function renderSignalsTable() {
        signalsTableBody.innerHTML = '';
        if (currentSignals.length === 0) {
            noSignalsMessage.classList.remove('hidden');
            return;
        }

        noSignalsMessage.classList.add('hidden');

        currentSignals.forEach(sig => {
            const tr = document.createElement('tr');
            const dirClass = sig.direction.toLowerCase() === 'call' ? 'call' : 'put';
            
            tr.innerHTML = `
                <td><strong>${sig.time}</strong></td>
                <td>${sig.asset}</td>
                <td><span class="timeframe-tag">${sig.timeframe}</span></td>
                <td><span class="direction-badge ${dirClass}">${sig.direction}</span></td>
                <td><span class="assertividade-value">${sig.assertiveness}%</span></td>
                <td>${sig.gale === 0 ? 'Sem Gale' : `${sig.gale} Gale(s)`}</td>
                <td><span class="text-secondary">Simulado</span></td>
            `;
            signalsTableBody.appendChild(tr);
        });
    }

    function updateStatsDashboard() {
        if (currentSignals.length === 0) {
            statAssertividade.textContent = '0%';
            statTotalSinais.textContent = '0';
            statGaleDistribution.textContent = '0% / 0% / 0%';
            return;
        }

        // Calculate average assertiveness
        let sum = currentSignals.reduce((acc, sig) => acc + sig.assertiveness, 0);
        let avgAssert = Math.round(sum / currentSignals.length);
        statAssertividade.textContent = `${avgAssert}%`;
        
        statTotalSinais.textContent = currentSignals.length;

        // Calculate gale distribution
        let direct = 0;
        let g1 = 0;
        let g2 = 0;

        currentSignals.forEach(sig => {
            if (sig.gale === 0) direct++;
            else if (sig.gale === 1) g1++;
            else g2++;
        });

        let directPct = Math.round((direct / currentSignals.length) * 100);
        let g1Pct = Math.round((g1 / currentSignals.length) * 100);
        let g2Pct = 100 - directPct - g1Pct;

        statGaleDistribution.textContent = `${directPct}% / ${g1Pct}% / ${g2Pct}%`;
    }

    // --- Copy list to Clipboard ---
    btnCopyText.addEventListener('click', () => {
        if (currentSignals.length === 0) {
            showToast('Nenhum sinal na lista para copiar.');
            return;
        }

        let txt = "";
        currentSignals.forEach(sig => {
            // Cleans timeframe (e.g. M1+ becomes M1)
            const cleanTf = sig.timeframe.replace("+", "");
            // Cleans asset (e.g. EUR/GBP becomes EURGBP, EUR/GBP-OTC becomes EURGBP-OTC)
            const cleanAsset = sig.asset.replace(/\//g, "");
            
            txt += `${cleanTf};${cleanAsset};${sig.time};${sig.direction}\n`;
        });

        navigator.clipboard.writeText(txt.trim()).then(() => {
            showToast('Lista copiada para a área de transferência!');
        }).catch(err => {
            console.error('Falha ao copiar: ', err);
        });
    });

    // --- Export as CSV ---
    btnExportCsv.addEventListener('click', () => {
        if (currentSignals.length === 0) {
            showToast('Nenhum sinal na lista para exportar.');
            return;
        }

        let csv = 'Timeframe;Ativo;Horario;Direcao;Assertividade;Gale\n';
        currentSignals.forEach(sig => {
            csv += `${sig.timeframe};${sig.asset};${sig.time};${sig.direction};${sig.assertiveness}%;${sig.gale}\n`;
        });

        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', `sinais_${selectedTimeframe}_${diasSelect.value}d.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    });

    // --- Tabs Navigation ---
    const tabSignals = document.getElementById('tabSignals');
    const tabAudit = document.getElementById('tabAudit');
    const signalsTabContent = document.getElementById('signalsTabContent');
    const auditTabContent = document.getElementById('auditTabContent');

    tabSignals.addEventListener('click', () => {
        tabSignals.classList.add('active');
        tabAudit.classList.remove('active');
        signalsTabContent.classList.remove('hidden');
        auditTabContent.classList.add('hidden');
    });

    tabAudit.addEventListener('click', () => {
        tabAudit.classList.add('active');
        tabSignals.classList.remove('active');
        auditTabContent.classList.remove('hidden');
        signalsTabContent.classList.add('hidden');
        runAuditing();
    });

    // --- Post-Operation Audit Logic ---
    const inputEntryValue = document.getElementById('inputEntryValue');
    const inputPayout = document.getElementById('inputPayout');
    const inputGaleMult = document.getElementById('inputGaleMult');
    const btnReAudit = document.getElementById('btnReAudit');
    const auditTableBody = document.getElementById('auditTableBody');
    const auditNetResult = document.getElementById('auditNetResult');
    const auditScore = document.getElementById('auditScore');
    const auditRealAssert = document.getElementById('auditRealAssert');

    btnReAudit.addEventListener('click', () => {
        runAuditing();
    });

    function runAuditing() {
        const pastedText = pastedSignalsInput.value.trim();
        if (pastedText) {
            const lines = pastedText.split('\n');
            let parsed = [];
            lines.forEach(line => {
                let parts = line.trim().split(';');
                if (parts.length >= 4) {
                    let tf = parts[0].trim().toUpperCase();
                    let asset = parts[1].trim();
                    let time = parts[2].trim();
                    let direction = parts[3].trim().toUpperCase();

                    let timeParts = time.split(':');
                    if (timeParts.length === 2) {
                        let hour = parseInt(timeParts[0]);
                        let minute = parseInt(timeParts[1]);
                        let rawMin = hour * 60 + minute;

                        if (!isNaN(rawMin)) {
                            parsed.push({
                                time: time,
                                rawMin: rawMin,
                                asset: resolveAsset(asset),
                                timeframe: tf,
                                direction: direction,
                                assertiveness: 100,
                                gale: parseInt(martingaleSelect.value)
                            });
                        }
                    }
                }
            });
            if (parsed.length > 0) {
                currentSignals = parsed;
            }
        } else {
            currentSignals = [...catalogedSignals];
        }

        auditTableBody.innerHTML = '';
        if (currentSignals.length === 0) {
            auditNetResult.textContent = "$0.00";
            auditScore.textContent = "0 W - 0 L";
            auditRealAssert.textContent = "0%";
            return;
        }

        const entryVal = parseFloat(inputEntryValue.value) || 10;
        const payout = (parseFloat(inputPayout.value) || 86) / 100;
        const galeMult = parseFloat(inputGaleMult.value) || 2.0;
        const maxGales = parseInt(martingaleSelect.value) || 0;

        let totalWins = 0;
        let totalLosses = 0;
        let netProfit = 0;

        currentSignals.forEach(sig => {
            // Evaluate trade on day 0 (today) against simulated candles
            let tradeResult = evaluateTrade(sig.asset, 0, sig.rawMin, sig.direction, maxGales);
            let outcome = tradeResult.outcome;
            let galeUsed = tradeResult.galeUsed;
            let profitOrLoss = 0;

            // Calculate money results based on binary options payouts
            if (outcome.startsWith("win")) {
                totalWins++;
                // Profit of winning step * payout minus previous step losses
                let stepEntry = entryVal * Math.pow(galeMult, galeUsed);
                let previousLosses = 0;
                for (let i = 0; i < galeUsed; i++) {
                    previousLosses += entryVal * Math.pow(galeMult, i);
                }
                profitOrLoss = (stepEntry * payout) - previousLosses;
            } else {
                totalLosses++;
                // Loss of all martingale steps combined
                let totalInvested = 0;
                for (let i = 0; i <= galeUsed; i++) {
                    totalInvested += entryVal * Math.pow(galeMult, i);
                }
                profitOrLoss = -totalInvested;
            }

            netProfit += profitOrLoss;

            // Append row
            const tr = document.createElement('tr');
            let resultBadge = "";
            let candlesText = "";

            if (outcome === "win_direct") {
                resultBadge = `<span class="badge-result win-direct">WIN DIRETO</span>`;
                candlesText = "1ª Vela";
            } else if (outcome === "win_gale") {
                resultBadge = `<span class="badge-result win-gale">WIN GALE ${galeUsed}</span>`;
                candlesText = `${galeUsed + 1} Velas`;
            } else {
                resultBadge = `<span class="badge-result loss">LOSS</span>`;
                candlesText = `${galeUsed + 1} Velas`;
            }

            const formattedProfit = profitOrLoss >= 0 ? 
                `<span class="text-green">+$${profitOrLoss.toFixed(2)}</span>` : 
                `<span class="text-red">-$${Math.abs(profitOrLoss).toFixed(2)}</span>`;

            tr.innerHTML = `
                <td><strong>${sig.time}</strong></td>
                <td>${sig.asset}</td>
                <td><span class="timeframe-tag">${sig.timeframe}</span></td>
                <td><span class="direction-badge ${sig.direction.toLowerCase()}">${sig.direction}</span></td>
                <td>${resultBadge}</td>
                <td>${candlesText}</td>
                <td>${formattedProfit}</td>
            `;
            auditTableBody.appendChild(tr);
        });

        // Update dashboard
        auditScore.textContent = `${totalWins} W - ${totalLosses} L`;
        const assertPct = ((totalWins / currentSignals.length) * 100).toFixed(1);
        auditRealAssert.textContent = `${assertPct}%`;

        if (netProfit >= 0) {
            auditNetResult.textContent = `+$${netProfit.toFixed(2)}`;
            auditNetResult.className = "audit-stat-val text-green";
        } else {
            auditNetResult.textContent = `-$${Math.abs(netProfit).toFixed(2)}`;
            auditNetResult.className = "audit-stat-val text-red";
        }
    }

    // --- Load and Audit Pasted Signals ---
    const btnLoadPasted = document.getElementById('btnLoadPasted');
    const pastedSignalsInput = document.getElementById('pastedSignals');

    function resolveAsset(cleanName) {
        const normalizedInput = cleanName.trim().toUpperCase().replace(/[^A-Z0-9-]/g, "");
        const dropdownItems = Array.from(document.querySelectorAll('#assetsDropdownList .dropdown-item'));
        
        for (let item of dropdownItems) {
            let val = item.getAttribute('data-value');
            let cleanVal = val.replace(/\//g, "").toUpperCase();
            if (cleanVal === normalizedInput || val.toUpperCase() === normalizedInput) {
                return val;
            }
        }
        
        // Reconstruct slashes for typical pairs
        if (normalizedInput.length === 6 && !normalizedInput.includes("-")) {
            return normalizedInput.slice(0, 3) + "/" + normalizedInput.slice(3);
        } else if (normalizedInput.includes("-OTC") && normalizedInput.replace("-OTC", "").length === 6) {
            let pair = normalizedInput.replace("-OTC", "");
            return pair.slice(0, 3) + "/" + pair.slice(3) + "-OTC";
        }
        return cleanName;
    }

    btnLoadPasted.addEventListener('click', () => {
        const text = pastedSignalsInput.value.trim();
        if (!text) {
            showToast('Por favor, cole os sinais no campo de texto.');
            return;
        }

        const lines = text.split('\n');
        let parsed = [];

        lines.forEach(line => {
            let parts = line.trim().split(';');
            if (parts.length >= 4) {
                let tf = parts[0].trim().toUpperCase();
                let asset = parts[1].trim();
                let time = parts[2].trim();
                let direction = parts[3].trim().toUpperCase();

                let timeParts = time.split(':');
                if (timeParts.length === 2) {
                    let hour = parseInt(timeParts[0]);
                    let minute = parseInt(timeParts[1]);
                    let rawMin = hour * 60 + minute;

                    if (!isNaN(rawMin)) {
                        parsed.push({
                            time: time,
                            rawMin: rawMin,
                            asset: resolveAsset(asset),
                            timeframe: tf,
                            direction: direction,
                            assertiveness: 100,
                            gale: parseInt(martingaleSelect.value)
                        });
                    }
                }
            }
        });

        if (parsed.length > 0) {
            currentSignals = parsed;
            runAuditing();
            showToast(`${parsed.length} sinal(s) carregado(s) e auditado(s) com sucesso!`);
        } else {
            showToast('Formato inválido. Use o padrão: TF;Ativo;Horário;Direção');
        }
    });

    function showToast(message) {
        copyToast.textContent = message;
        copyToast.classList.remove('hidden');
        setTimeout(() => {
            copyToast.classList.add('hidden');
        }, 3000);
    }

    // --- Initialize App ---
    loadSavedPresets();
    renderAssetPills();
    updateDropdownSelections();
    runCataloging(); // Auto run initial cataloging

    // Start Button Event
    btnStart.addEventListener('click', () => {
        runCataloging();
    });
});
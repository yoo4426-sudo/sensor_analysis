/**
 * dashboard.js
 * 
 * Interactive Controller & Visualization Engine for Sensor Diagnostic Dashboard
 * Integrates all 20 Analytics Techniques with Chart.js and local UI handlers.
 */

(function () {
  'use strict';

  // Application State
  const state = {
    records: [],
    timestamps: [],
    minutes: [],
    rawTemps: [],
    trueTemps: [],
    vibrations: [],
    pressures: [],
    events: [],
    
    // Sliders & Filter Parameters
    params: {
      smaWindow: 15,
      emaAlpha: 0.15,
      sgWindow: 15,
      sgDegree: 2,
      medianWindow: 5,
      hampelWindow: 7,
      hampelSigma: 3.0,
      kalmanQ: 0.02,
      kalmanR: 0.8,
      envelopeWindow: 30,
      zScoreWindow: 30,
      zScoreThresh: 3.0,
      iqrMult: 1.5,
      ewmaLambda: 0.2,
      ewmaL: 3.0,
      cusumK: 0.5,
      cusumH: 4.0
    },

    // Active series toggles on main chart
    activeLayers: {
      raw: true,
      truth: true,
      sma: true,
      ema: false,
      sg: true,
      median: false,
      hampel: true,
      kalman: true,
      envelope: false
    },

    charts: {},
    theme: 'dark'
  };

  // Event category colors & metadata
  const EVENT_META = {
    '정상': { color: '#10b981', bg: 'rgba(16, 185, 129, 0.12)', label: '정상 (Normal)' },
    '스파이크 이상치': { color: '#ec4899', bg: 'rgba(236, 72, 153, 0.25)', label: '스파이크 이상치 (Spike Outlier)' },
    '단기 과열': { color: '#f97316', bg: 'rgba(249, 115, 22, 0.2)', label: '단기 과열 (Short Overheat)' },
    '부하 증가': { color: '#3b82f6', bg: 'rgba(59, 130, 246, 0.2)', label: '부하 증가 (Load Increase)' },
    '급격한 과열': { color: '#ef4444', bg: 'rgba(239, 68, 68, 0.25)', label: '급격한 과열 (Rapid Overheat)' },
    '장시간 부하': { color: '#8b5cf6', bg: 'rgba(139, 92, 246, 0.2)', label: '장시간 부하 (Prolonged Load)' },
    '일시 냉각': { color: '#06b6d4', bg: 'rgba(6, 182, 212, 0.2)', label: '일시 냉각 (Temporary Cooling)' }
  };

  // Helper: Format number with decimals
  function fmt(val, d = 2) {
    return typeof val === 'number' && !isNaN(val) ? val.toFixed(d) : '-';
  }

  // DOM ready entry point
  document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    initTabs();
    initControls();
    loadInitialData();
  });

  // Theme Management
  function initTheme() {
    const themeBtn = document.getElementById('themeToggleBtn');
    if (themeBtn) {
      themeBtn.addEventListener('click', () => {
        state.theme = state.theme === 'dark' ? 'light' : 'dark';
        document.body.setAttribute('data-theme', state.theme);
        themeBtn.innerHTML = state.theme === 'dark' 
          ? `<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" fill="none"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg> 다크모드` 
          : `<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" fill="none"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg> 라이트모드`;
        updateAllChartThemes();
      });
    }
  }

  function updateAllChartThemes() {
    const isDark = state.theme === 'dark';
    const textColor = isDark ? '#94a3b8' : '#475569';
    const gridColor = isDark ? 'rgba(51, 65, 85, 0.35)' : 'rgba(203, 213, 225, 0.6)';

    Object.values(state.charts).forEach(chart => {
      if (!chart || !chart.options) return;
      if (chart.options.scales) {
        Object.values(chart.options.scales).forEach(scale => {
          if (scale.ticks) scale.ticks.color = textColor;
          if (scale.grid) scale.grid.color = gridColor;
        });
      }
      if (chart.options.plugins && chart.options.plugins.legend) {
        chart.options.plugins.legend.labels.color = isDark ? '#f8fafc' : '#0f172a';
      }
      chart.update();
    });
  }

  // Tab Navigation with On-Demand Rendering
  function initTabs() {
    const tabBtns = document.querySelectorAll('.tab-btn');
    tabBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const target = btn.getAttribute('data-tab');
        tabBtns.forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        
        btn.classList.add('active');
        const content = document.getElementById(target);
        if (content) content.classList.add('active');

        // Render & Resize charts for the activated tab
        requestAnimationFrame(() => {
          if (target === 'tab-smoothing') renderTab1Smoothing();
          else if (target === 'tab-benchmark') renderTab2Benchmarks();
          else if (target === 'tab-anomaly') renderTab3Anomaly();
          else if (target === 'tab-multivariate') renderTab4Multivariate();
          else if (target === 'tab-frequency') renderTab5Frequency();
          else if (target === 'tab-report') renderTab6Report();

          setTimeout(() => {
            Object.values(state.charts).forEach(c => {
              if (c && typeof c.resize === 'function') c.resize();
            });
          }, 30);
        });
      });
    });
  }

  // Load Initial Data (pre-bundled sensor_data.js)
  function loadInitialData() {
    if (window.SENSOR_DATA && Array.isArray(window.SENSOR_DATA) && window.SENSOR_DATA.length > 0) {
      processLoadedData(window.SENSOR_DATA);
    } else {
      // Fallback: try fetch
      fetch('sensor_data.json')
        .then(res => res.json())
        .then(data => processLoadedData(data))
        .catch(err => {
          console.warn('Auto data load warning:', err);
          document.getElementById('dataStatusMsg').textContent = '데이터 파일을 업로드해주세요.';
        });
    }
  }

  // Process & cache records
  function processLoadedData(records) {
    state.records = records;
    state.timestamps = records.map(r => r.timestamp ? r.timestamp.substring(11, 16) : r.elapsedMinutes + 'm');
    state.minutes = records.map(r => r.elapsedMinutes);
    state.rawTemps = records.map(r => r.rawTemp);
    state.trueTemps = records.map(r => r.trueTemp);
    state.vibrations = records.map(r => r.vibration);
    state.pressures = records.map(r => r.pressure);
    state.events = records.map(r => r.event || '정상');

    updateKpis();
    renderAllVisualizations();
    document.getElementById('dataStatusMsg').textContent = `로드 완료: 1,440행 (24시간 1분 간격)`;
  }

  // Update Global KPI Cards
  function updateKpis() {
    const raw = state.rawTemps;
    const truth = state.trueTemps;
    const vib = state.vibrations;
    const pres = state.pressures;

    const minRaw = Math.min(...raw);
    const maxRaw = Math.max(...raw);
    const minTrue = Math.min(...truth);
    const maxTrue = Math.max(...truth);

    document.getElementById('kpiObsCount').textContent = state.records.length.toLocaleString();
    document.getElementById('kpiTempRange').textContent = `${minRaw.toFixed(1)} ~ ${maxRaw.toFixed(1)}°C`;
    document.getElementById('kpiTempTruthSub').textContent = `참값: ${minTrue.toFixed(1)} ~ ${maxTrue.toFixed(1)}°C`;
    
    const avgVib = Analytics.mean(vib);
    const maxVib = Math.max(...vib);
    document.getElementById('kpiVibration').textContent = `${avgVib.toFixed(2)} mm/s`;
    document.getElementById('kpiVibMaxSub').textContent = `최대: ${maxVib.toFixed(2)} mm/s`;

    const avgPres = Analytics.mean(pres);
    const maxPres = Math.max(...pres);
    document.getElementById('kpiPressure').textContent = `${avgPres.toFixed(1)} kPa`;
    document.getElementById('kpiPresMaxSub').textContent = `최대: ${maxPres.toFixed(1)} kPa`;

    // Count anomalies
    const spikeCount = state.events.filter(e => e === '스파이크 이상치').length;
    const eventMins = state.events.filter(e => e !== '정상').length;
    document.getElementById('kpiAnomalies').textContent = `${spikeCount}건 / ${eventMins}분`;
  }

  // Connect Slider & Toggle Controls
  function initControls() {
    // Slider binds helper
    function bindSlider(id, paramKey, isFloat = false) {
      const slider = document.getElementById(id);
      const valDisplay = document.getElementById(id + 'Val');
      if (!slider || !valDisplay) return;

      slider.addEventListener('input', (e) => {
        const val = isFloat ? parseFloat(e.target.value) : parseInt(e.target.value, 10);
        state.params[paramKey] = val;
        valDisplay.textContent = val;
        refreshOnParamChange();
      });
    }

    bindSlider('sliderSma', 'smaWindow');
    bindSlider('sliderSgWin', 'sgWindow');
    bindSlider('sliderSgDeg', 'sgDegree');
    bindSlider('sliderKalmanQ', 'kalmanQ', true);
    bindSlider('sliderKalmanR', 'kalmanR', true);
    bindSlider('sliderMedian', 'medianWindow');
    bindSlider('sliderHampel', 'hampelWindow');
    bindSlider('sliderZThresh', 'zScoreThresh', true);
    bindSlider('sliderCusumK', 'cusumK', true);

    // Layer checkboxes
    const layerChips = document.querySelectorAll('.toggle-chip');
    layerChips.forEach(chip => {
      chip.addEventListener('click', () => {
        const layer = chip.getAttribute('data-layer');
        state.activeLayers[layer] = !state.activeLayers[layer];
        chip.classList.toggle('active', state.activeLayers[layer]);
        updateMainChartVisibility();
      });
    });

    // File Drag & Drop / Upload
    const fileInput = document.getElementById('fileUploadInput');
    if (fileInput) {
      fileInput.addEventListener('change', handleFileUpload);
    }

    // Reset button
    const resetBtn = document.getElementById('resetDataBtn');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        if (window.SENSOR_DATA) {
          processLoadedData(window.SENSOR_DATA);
        }
      });
    }

    // Export CSV
    const exportBtn = document.getElementById('exportCsvBtn');
    if (exportBtn) {
      exportBtn.addEventListener('click', exportProcessedCsv);
    }
  }

  function refreshOnParamChange() {
    renderTab1Smoothing();
    renderTab2Benchmarks();
    renderTab3Anomaly();
  }

  // Handle uploaded Excel or CSV
  function handleFileUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (evt) {
      try {
        const data = evt.target.result;
        if (typeof XLSX !== 'undefined') {
          const workbook = XLSX.read(data, { type: 'binary' });
          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];
          const json = XLSX.utils.sheet_to_json(worksheet);
          
          if (json.length > 0) {
            // Map columns robustly
            const mapped = json.map((row, idx) => {
              return {
                index: idx,
                timestamp: row['측정시각'] || row['timestamp'] || `Point ${idx}`,
                elapsedMinutes: Number(row['경과시간(분)'] || row['elapsedMinutes'] || idx),
                elapsedHours: Number(row['경과시간(시간)'] || row['elapsedHours'] || (idx / 60)),
                rawTemp: Number(row['온도센서 원시값(°C)'] || row['rawTemp'] || row['temperature'] || 0),
                trueTemp: Number(row['온도 참값·비교용(°C)'] || row['trueTemp'] || row['rawTemp'] || 0),
                vibration: Number(row['진동 RMS(mm/s)'] || row['vibration'] || 0),
                pressure: Number(row['압력(kPa)'] || row['pressure'] || 100),
                event: row['이벤트'] || row['event'] || '정상'
              };
            });
            processLoadedData(mapped);
          }
        }
      } catch (err) {
        alert('파일 파싱 중 오류가 발생했습니다: ' + err.message);
      }
    };
    reader.readAsBinaryString(file);
  }

  // Render all tabs
  function renderAllVisualizations() {
    renderTab1Smoothing();
    renderTab2Benchmarks();
    renderTab3Anomaly();
    renderTab4Multivariate();
    renderTab5Frequency();
    renderTab6Report();
  }

  // ==========================================
  // TAB 1: Smoothing & Noise Filtering (Tech 1 ~ 7)
  // ==========================================
  function renderTab1Smoothing() {
    const raw = state.rawTemps;
    const truth = state.trueTemps;
    const labels = state.timestamps;

    // Execute Techniques 1 ~ 7
    const sma = Analytics.sma(raw, state.params.smaWindow, true);
    const ema = Analytics.ema(raw, state.params.emaAlpha);
    const sg = Analytics.savitzkyGolay(raw, state.params.sgWindow, state.params.sgDegree);
    const med = Analytics.medianFilter(raw, state.params.medianWindow);
    const hampelRes = Analytics.hampelFilter(raw, state.params.hampelWindow, state.params.hampelSigma);
    const kalman = Analytics.kalmanFilter(raw, state.params.kalmanQ, state.params.kalmanR);
    const env = Analytics.peakEnvelope(raw, state.params.envelopeWindow);

    // Save on state for tab 2 benchmark
    state.filteredSeries = {
      raw,
      truth,
      sma,
      ema,
      sg,
      median: med,
      hampel: hampelRes.filtered,
      kalman,
      upperEnv: env.upper,
      lowerEnv: env.lower
    };

    const ctx = document.getElementById('mainSmoothingChart');
    if (!ctx) return;

    const datasets = [
      {
        label: '원시 센서값 (Raw)',
        data: raw,
        borderColor: '#94a3b8',
        backgroundColor: 'transparent',
        borderWidth: 1.2,
        pointRadius: 0,
        hidden: !state.activeLayers.raw
      },
      {
        label: '참값·비교용 (Ground Truth)',
        data: truth,
        borderColor: '#10b981',
        backgroundColor: 'transparent',
        borderWidth: 2.2,
        pointRadius: 0,
        borderDash: [5, 4],
        hidden: !state.activeLayers.truth
      },
      {
        label: `SMA (w=${state.params.smaWindow})`,
        data: sma,
        borderColor: '#38bdf8',
        backgroundColor: 'transparent',
        borderWidth: 2,
        pointRadius: 0,
        hidden: !state.activeLayers.sma
      },
      {
        label: `EMA (α=${state.params.emaAlpha})`,
        data: ema,
        borderColor: '#60a5fa',
        backgroundColor: 'transparent',
        borderWidth: 1.8,
        pointRadius: 0,
        hidden: !state.activeLayers.ema
      },
      {
        label: `Savitzky-Golay (w=${state.params.sgWindow}, d=${state.params.sgDegree})`,
        data: sg,
        borderColor: '#f59e0b',
        backgroundColor: 'transparent',
        borderWidth: 2.2,
        pointRadius: 0,
        hidden: !state.activeLayers.sg
      },
      {
        label: `중앙값 필터 (w=${state.params.medianWindow})`,
        data: med,
        borderColor: '#a855f7',
        backgroundColor: 'transparent',
        borderWidth: 1.8,
        pointRadius: 0,
        hidden: !state.activeLayers.median
      },
      {
        label: `햄펠 필터 (w=${state.params.hampelWindow})`,
        data: hampelRes.filtered,
        borderColor: '#ec4899',
        backgroundColor: 'transparent',
        borderWidth: 2.0,
        pointRadius: 0,
        hidden: !state.activeLayers.hampel
      },
      {
        label: `칼만 필터 (Q=${state.params.kalmanQ}, R=${state.params.kalmanR})`,
        data: kalman,
        borderColor: '#06b6d4',
        backgroundColor: 'transparent',
        borderWidth: 2.2,
        pointRadius: 0,
        hidden: !state.activeLayers.kalman
      },
      {
        label: '상단 포락선 (Upper Envelope)',
        data: env.upper,
        borderColor: 'rgba(239, 68, 68, 0.6)',
        borderDash: [3, 3],
        borderWidth: 1.2,
        pointRadius: 0,
        fill: false,
        hidden: !state.activeLayers.envelope
      },
      {
        label: '하단 포락선 (Lower Envelope)',
        data: env.lower,
        borderColor: 'rgba(59, 130, 246, 0.6)',
        borderDash: [3, 3],
        borderWidth: 1.2,
        pointRadius: 0,
        fill: false,
        hidden: !state.activeLayers.envelope
      }
    ];

    if (state.charts.mainSmoothing) {
      state.charts.mainSmoothing.data.labels = labels;
      state.charts.mainSmoothing.data.datasets = datasets;
      state.charts.mainSmoothing.update('none');
    } else {
      state.charts.mainSmoothing = new Chart(ctx, {
        type: 'line',
        data: { labels, datasets },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          plugins: {
            legend: {
              position: 'top',
              labels: { boxWidth: 14, color: state.theme === 'dark' ? '#f8fafc' : '#0f172a', font: { size: 11 } }
            },
            tooltip: {
              callbacks: {
                title: (items) => `${labels[items[0].dataIndex]} (${items[0].dataIndex}분 경과) | ${state.events[items[0].dataIndex]}`
              }
            }
          },
          scales: {
            x: {
              grid: { color: 'rgba(51, 65, 85, 0.25)' },
              ticks: { maxTicksLimit: 14, color: '#94a3b8', font: { size: 10 } }
            },
            y: {
              title: { display: true, text: '온도 (°C)', color: '#94a3b8' },
              grid: { color: 'rgba(51, 65, 85, 0.25)' },
              ticks: { color: '#94a3b8' }
            }
          }
        }
      });
    }
  }

  function updateMainChartVisibility() {
    if (!state.charts.mainSmoothing) return;
    const c = state.charts.mainSmoothing;
    c.data.datasets[0].hidden = !state.activeLayers.raw;
    c.data.datasets[1].hidden = !state.activeLayers.truth;
    c.data.datasets[2].hidden = !state.activeLayers.sma;
    c.data.datasets[3].hidden = !state.activeLayers.ema;
    c.data.datasets[4].hidden = !state.activeLayers.sg;
    c.data.datasets[5].hidden = !state.activeLayers.median;
    c.data.datasets[6].hidden = !state.activeLayers.hampel;
    c.data.datasets[7].hidden = !state.activeLayers.kalman;
    c.data.datasets[8].hidden = !state.activeLayers.envelope;
    c.data.datasets[9].hidden = !state.activeLayers.envelope;
    c.update();
  }

  // ==========================================
  // TAB 2: Filter Benchmark & Signal Quality (Tech 8 & 9)
  // ==========================================
  function renderTab2Benchmarks() {
    if (!state.filteredSeries) return;
    const truth = state.trueTemps;
    const raw = state.rawTemps;

    const filters = [
      { key: 'raw', name: 'Raw Sensor (원시값)', data: raw, color: '#94a3b8' },
      { key: 'sma', name: `SMA (w=${state.params.smaWindow})`, data: state.filteredSeries.sma, color: '#38bdf8' },
      { key: 'ema', name: `EMA (α=${state.params.emaAlpha})`, data: state.filteredSeries.ema, color: '#60a5fa' },
      { key: 'sg', name: `Savitzky-Golay (w=${state.params.sgWindow}, d=${state.params.sgDegree})`, data: state.filteredSeries.sg, color: '#f59e0b' },
      { key: 'median', name: `Median (w=${state.params.medianWindow})`, data: state.filteredSeries.median, color: '#a855f7' },
      { key: 'hampel', name: `Hampel (w=${state.params.hampelWindow})`, data: state.filteredSeries.hampel, color: '#ec4899' },
      { key: 'kalman', name: `Kalman (Q=${state.params.kalmanQ}, R=${state.params.kalmanR})`, data: state.filteredSeries.kalman, color: '#06b6d4' }
    ];

    const benchmarkResults = filters.map(f => {
      const metrics = Analytics.calcErrorMetrics(f.data, truth);
      const snr = Analytics.calcNoiseReduction(raw, f.data, truth);
      return { ...f, ...metrics, ...snr };
    });

    // Sort by RMSE ascending for ranking
    const ranked = benchmarkResults.slice().sort((a, b) => a.rmse - b.rmse);

    // Update Benchmark Table
    const tbody = document.getElementById('benchmarkTableBody');
    if (tbody) {
      tbody.innerHTML = ranked.map((r, idx) => {
        const isBest = idx === 0;
        return `
          <tr class="${isBest ? 'highlight' : ''}">
            <td><strong>#${idx + 1}</strong></td>
            <td><span style="color: ${r.color}">●</span> ${r.name}</td>
            <td>${r.rmse} °C</td>
            <td>${r.mae} °C</td>
            <td>${r.maxErr} °C</td>
            <td>${r.corr}</td>
            <td>${r.noiseReductionPct}%</td>
            <td>+${r.snrGainDb} dB</td>
            <td>${isBest ? '<span class="badge badge-emerald">최적 필터</span>' : (r.maxErr > 5 ? '<span class="badge badge-rose">스파이크 취약</span>' : '<span class="badge badge-blue">양호</span>')}</td>
          </tr>
        `;
      }).join('');
    }

    // Render Benchmark Bar Chart
    const ctxBar = document.getElementById('benchmarkBarChart');
    if (ctxBar) {
      const labels = ranked.map(r => r.name);
      const rmseData = ranked.map(r => r.rmse);
      const maeData = ranked.map(r => r.mae);

      if (state.charts.benchmarkBar) {
        state.charts.benchmarkBar.data.labels = labels;
        state.charts.benchmarkBar.data.datasets[0].data = rmseData;
        state.charts.benchmarkBar.data.datasets[1].data = maeData;
        state.charts.benchmarkBar.update();
      } else {
        state.charts.benchmarkBar = new Chart(ctxBar, {
          type: 'bar',
          data: {
            labels,
            datasets: [
              { label: 'RMSE (평균제곱근오차 °C)', data: rmseData, backgroundColor: 'rgba(56, 189, 248, 0.7)' },
              { label: 'MAE (평균절대오차 °C)', data: maeData, backgroundColor: 'rgba(16, 185, 129, 0.7)' }
            ]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
              x: { ticks: { color: '#94a3b8', font: { size: 10 } } },
              y: { title: { display: true, text: '오차 (°C)', color: '#94a3b8' }, ticks: { color: '#94a3b8' } }
            }
          }
        });
      }
    }

    // Render Noise Reduction & SNR Radar/Bar Chart
    const ctxRadar = document.getElementById('benchmarkSnrChart');
    if (ctxRadar) {
      const labels = ranked.map(r => r.name);
      const noiseRed = ranked.map(r => r.noiseReductionPct);

      if (state.charts.benchmarkSnr) {
        state.charts.benchmarkSnr.data.labels = labels;
        state.charts.benchmarkSnr.data.datasets[0].data = noiseRed;
        state.charts.benchmarkSnr.update();
      } else {
        state.charts.benchmarkSnr = new Chart(ctxRadar, {
          type: 'bar',
          data: {
            labels,
            datasets: [
              { label: '노이즈 감쇄율 (%)', data: noiseRed, backgroundColor: 'rgba(168, 85, 247, 0.75)' }
            ]
          },
          options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            scales: {
              x: { max: 100, title: { display: true, text: '감쇄율 (%)', color: '#94a3b8' }, ticks: { color: '#94a3b8' } },
              y: { ticks: { color: '#94a3b8', font: { size: 10 } } }
            }
          }
        });
      }
    }
  }

  // ==========================================
  // TAB 3: Anomaly Detection & SPC (Tech 10 ~ 14)
  // ==========================================
  function renderTab3Anomaly() {
    const raw = state.rawTemps;
    const labels = state.timestamps;
    const N = raw.length;

    // Tech 10: Rolling Z-Score
    const zRes = Analytics.rollingZScore(raw, state.params.zScoreWindow, state.params.zScoreThresh);

    // Tech 11: IQR Rule
    const iqrRes = Analytics.iqrAnomaly(raw, state.params.iqrMult);

    // Tech 12: SPC EWMA Control Chart
    const ewmaRes = Analytics.ewmaControlChart(raw, state.params.ewmaLambda, state.params.ewmaL);

    // Tech 13: CUSUM Chart
    const cusumRes = Analytics.cusum(raw, null, state.params.cusumK, state.params.cusumH);

    // Tech 14: Benchmark against Ground Truth Anomaly Events
    const trueSpikeIndices = [];
    const trueOverheatIndices = [];
    state.events.forEach((ev, idx) => {
      if (ev === '스파이크 이상치') trueSpikeIndices.push(idx);
      if (ev === '급격한 과열' || ev === '단기 과열') trueOverheatIndices.push(idx);
    });

    const detectedZIndices = zRes.anomalies.map(a => a.index);
    const zEval = Analytics.evaluateAnomalies(detectedZIndices, trueSpikeIndices, N, 2);

    const ewmaViolIndices = ewmaRes.violations.map(v => v.index);
    const ewmaEval = Analytics.evaluateAnomalies(ewmaViolIndices, trueOverheatIndices, N, 5);

    // Render Confusion Matrix & Performance KPI
    const matrixBox = document.getElementById('anomalyPerfBox');
    if (matrixBox) {
      matrixBox.innerHTML = `
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 1rem; margin-top: 0.5rem;">
          <div class="kpi-card purple">
            <div class="kpi-title">Z-Score 스파이크 탐지율</div>
            <div class="kpi-value" style="font-size: 1.4rem;">${zEval.recall}%</div>
            <div class="kpi-sub">정밀도 ${zEval.precision}% | F1 ${zEval.f1}</div>
          </div>
          <div class="kpi-card rose">
            <div class="kpi-title">EWMA 공정 이상 포착률</div>
            <div class="kpi-value" style="font-size: 1.4rem;">${ewmaEval.recall}%</div>
            <div class="kpi-sub">정밀도 ${ewmaEval.precision}% | F1 ${ewmaEval.f1}</div>
          </div>
          <div class="kpi-card cyan">
            <div class="kpi-title">IQR 글로벌 이상치</div>
            <div class="kpi-value" style="font-size: 1.4rem;">${iqrRes.anomalies.length}개</div>
            <div class="kpi-sub">하한 ${iqrRes.lower.toFixed(1)}°C ~ 상한 ${iqrRes.upper.toFixed(1)}°C</div>
          </div>
        </div>
      `;
    }

    // Chart 1: EWMA Control Chart with UCL/LCL
    const ctxEwma = document.getElementById('spcEwmaChart');
    if (ctxEwma) {
      if (state.charts.spcEwma) {
        state.charts.spcEwma.data.labels = labels;
        state.charts.spcEwma.data.datasets[0].data = raw;
        state.charts.spcEwma.data.datasets[1].data = ewmaRes.ewma;
        state.charts.spcEwma.data.datasets[2].data = ewmaRes.ucl;
        state.charts.spcEwma.data.datasets[3].data = ewmaRes.lcl;
        state.charts.spcEwma.update();
      } else {
        state.charts.spcEwma = new Chart(ctxEwma, {
          type: 'line',
          data: {
            labels,
            datasets: [
              { label: '원시 관측값 (X_t)', data: raw, borderColor: 'rgba(148, 163, 184, 0.4)', borderWidth: 1, pointRadius: 0 },
              { label: `EWMA (λ=${state.params.ewmaLambda})`, data: ewmaRes.ewma, borderColor: '#38bdf8', borderWidth: 2, pointRadius: 0 },
              { label: '관리 상한선 (UCL +3σ)', data: ewmaRes.ucl, borderColor: '#ef4444', borderDash: [4, 4], borderWidth: 1.5, pointRadius: 0 },
              { label: '관리 하한선 (LCL -3σ)', data: ewmaRes.lcl, borderColor: '#3b82f6', borderDash: [4, 4], borderWidth: 1.5, pointRadius: 0 }
            ]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
              x: { ticks: { maxTicksLimit: 12, color: '#94a3b8' }, grid: { color: 'rgba(51, 65, 85, 0.25)' } },
              y: { title: { display: true, text: '온도 (°C)', color: '#94a3b8' }, ticks: { color: '#94a3b8' } }
            }
          }
        });
      }
    }

    // Chart 2: CUSUM Drift Chart
    const ctxCusum = document.getElementById('cusumChart');
    if (ctxCusum) {
      const threshLine = new Array(N).fill(cusumRes.threshold);
      if (state.charts.cusum) {
        state.charts.cusum.data.labels = labels;
        state.charts.cusum.data.datasets[0].data = cusumRes.posCusum;
        state.charts.cusum.data.datasets[1].data = cusumRes.negCusum;
        state.charts.cusum.data.datasets[2].data = threshLine;
        state.charts.cusum.update();
      } else {
        state.charts.cusum = new Chart(ctxCusum, {
          type: 'line',
          data: {
            labels,
            datasets: [
              { label: '양의 누적합 (C+ 과열 드리프트)', data: cusumRes.posCusum, borderColor: '#f97316', backgroundColor: 'rgba(249, 115, 22, 0.1)', fill: true, borderWidth: 1.8, pointRadius: 0 },
              { label: '음의 누적합 (C- 냉각 드리프트)', data: cusumRes.negCusum, borderColor: '#06b6d4', backgroundColor: 'rgba(6, 182, 212, 0.1)', fill: true, borderWidth: 1.8, pointRadius: 0 },
              { label: `경보 임계치 H (${cusumRes.threshold.toFixed(2)})`, data: threshLine, borderColor: '#ef4444', borderDash: [5, 5], borderWidth: 1.5, pointRadius: 0 }
            ]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
              x: { ticks: { maxTicksLimit: 12, color: '#94a3b8' }, grid: { color: 'rgba(51, 65, 85, 0.25)' } },
              y: { title: { display: true, text: '누적 잔차합', color: '#94a3b8' }, ticks: { color: '#94a3b8' } }
            }
          }
        });
      }
    }
  }

  // ==========================================
  // TAB 4: Multivariate Correlation & Dynamics (Tech 15 ~ 18)
  // ==========================================
  function renderTab4Multivariate() {
    const raw = state.rawTemps;
    const trueTemp = state.trueTemps;
    const vib = state.vibrations;
    const pres = state.pressures;
    const labels = state.timestamps;

    // Tech 15: Pearson & Spearman Correlation Matrix
    const rVibTemp = Analytics.pearsonCorrelation(vib, trueTemp);
    const rPresTemp = Analytics.pearsonCorrelation(pres, trueTemp);
    const rVibPres = Analytics.pearsonCorrelation(vib, pres);

    const sVibTemp = Analytics.spearmanCorrelation(vib, trueTemp);
    const sPresTemp = Analytics.spearmanCorrelation(pres, trueTemp);
    const sVibPres = Analytics.spearmanCorrelation(vib, pres);

    // Update matrix display
    const matrixElem = document.getElementById('corrMatrixContainer');
    if (matrixElem) {
      matrixElem.innerHTML = `
        <table class="data-table">
          <thead>
            <tr>
              <th>변수 쌍</th>
              <th>피어슨 r (선형 관계)</th>
              <th>스피어만 ρ (단조 관계)</th>
              <th>물리적 결합 강도 및 해석</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><strong>진동 RMS ↔ 온도</strong></td>
              <td class="highlight">${fmt(rVibTemp, 3)}</td>
              <td>${fmt(sVibTemp, 3)}</td>
              <td><span class="badge badge-rose">강한 양의 상관 (모터 부하 발열)</span></td>
            </tr>
            <tr>
              <td><strong>압력 ↔ 온도</strong></td>
              <td class="highlight">${fmt(rPresTemp, 3)}</td>
              <td>${fmt(sPresTemp, 3)}</td>
              <td><span class="badge badge-amber">중간 양의 상관 (유압/공압 팽창)</span></td>
            </tr>
            <tr>
              <td><strong>진동 RMS ↔ 압력</strong></td>
              <td class="highlight">${fmt(rVibPres, 3)}</td>
              <td>${fmt(sVibPres, 3)}</td>
              <td><span class="badge badge-blue">적정 상관 (동시 부하 가중)</span></td>
            </tr>
          </tbody>
        </table>
      `;
    }

    // Tech 16: Cross-Correlation Lag Curve (Lead/Lag detection)
    const crossVib = Analytics.crossCorrelation(vib, trueTemp, 30);
    const crossPres = Analytics.crossCorrelation(pres, trueTemp, 30);

    const ctxCross = document.getElementById('crossCorrChart');
    if (ctxCross) {
      if (state.charts.crossCorr) {
        state.charts.crossCorr.data.labels = crossVib.lags.map(l => (l > 0 ? `+${l}분` : `${l}분`));
        state.charts.crossCorr.data.datasets[0].data = crossVib.correlations;
        state.charts.crossCorr.data.datasets[1].data = crossPres.correlations;
        state.charts.crossCorr.update();
      } else {
        state.charts.crossCorr = new Chart(ctxCross, {
          type: 'line',
          data: {
            labels: crossVib.lags.map(l => (l > 0 ? `+${l}분` : `${l}분`)),
            datasets: [
              { label: '진동 ↔ 온도 시차 상관 R(τ)', data: crossVib.correlations, borderColor: '#ec4899', borderWidth: 2, pointRadius: 1 },
              { label: '압력 ↔ 온도 시차 상관 R(τ)', data: crossPres.correlations, borderColor: '#06b6d4', borderWidth: 2, pointRadius: 1 }
            ]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
              x: { title: { display: true, text: '시차 Lag τ (분): 음수=압력/진동 선행, 양수=온도 선행', color: '#94a3b8' }, ticks: { color: '#94a3b8' } },
              y: { title: { display: true, text: '상관계수 R(τ)', color: '#94a3b8' }, ticks: { color: '#94a3b8' } }
            }
          }
        });
      }
    }

    // Tech 17: Rolling Dynamic Correlation (60m window)
    const rollVibTemp = Analytics.rollingCorrelation(vib, trueTemp, 60);
    const rollPresTemp = Analytics.rollingCorrelation(pres, trueTemp, 60);

    const ctxRoll = document.getElementById('rollingCorrChart');
    if (ctxRoll) {
      if (state.charts.rollingCorr) {
        state.charts.rollingCorr.data.labels = labels;
        state.charts.rollingCorr.data.datasets[0].data = rollVibTemp;
        state.charts.rollingCorr.data.datasets[1].data = rollPresTemp;
        state.charts.rollingCorr.update();
      } else {
        state.charts.rollingCorr = new Chart(ctxRoll, {
          type: 'line',
          data: {
            labels,
            datasets: [
              { label: '60분 롤링 상관 (진동 ↔ 온도)', data: rollVibTemp, borderColor: '#38bdf8', borderWidth: 1.8, pointRadius: 0 },
              { label: '60분 롤링 상관 (압력 ↔ 온도)', data: rollPresTemp, borderColor: '#f59e0b', borderWidth: 1.8, pointRadius: 0 }
            ]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
              x: { ticks: { maxTicksLimit: 12, color: '#94a3b8' } },
              y: { min: -0.5, max: 1.0, title: { display: true, text: '동적 상관계수', color: '#94a3b8' }, ticks: { color: '#94a3b8' } }
            }
          }
        });
      }
    }

    // Tech 18: Phase Space 2D Trajectory (Temp vs Vibration)
    const phaseRes = Analytics.phaseSpaceTrajectory(trueTemp, vib, pres, state.events);
    const ctxPhase = document.getElementById('phaseSpaceChart');
    if (ctxPhase) {
      // Group scatter points by event
      const eventGroups = {};
      phaseRes.points.forEach(pt => {
        if (!eventGroups[pt.event]) eventGroups[pt.event] = [];
        eventGroups[pt.event].push({ x: pt.zVib, y: pt.zTemp });
      });

      const phaseDatasets = Object.keys(eventGroups).map(ev => {
        const meta = EVENT_META[ev] || { color: '#94a3b8' };
        return {
          label: ev,
          data: eventGroups[ev],
          backgroundColor: meta.color,
          pointRadius: ev === '정상' ? 2 : 5,
          pointHoverRadius: 7
        };
      });

      if (state.charts.phaseSpace) {
        state.charts.phaseSpace.data.datasets = phaseDatasets;
        state.charts.phaseSpace.update();
      } else {
        state.charts.phaseSpace = new Chart(ctxPhase, {
          type: 'scatter',
          data: { datasets: phaseDatasets },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
              x: { title: { display: true, text: '표준화 진동 (Z-Score)', color: '#94a3b8' }, ticks: { color: '#94a3b8' } },
              y: { title: { display: true, text: '표준화 온도 (Z-Score)', color: '#94a3b8' }, ticks: { color: '#94a3b8' } }
            }
          }
        });
      }
    }
  }

  // ==========================================
  // TAB 5: Frequency & Spectral Analysis (Tech 19 ~ 20)
  // ==========================================
  function renderTab5Frequency() {
    const truth = state.trueTemps;

    // Tech 19: DFT / PSD
    const dftRes = Analytics.discreteFourierTransform(truth, 1, 90);

    const ctxDft = document.getElementById('dftPsdChart');
    if (ctxDft) {
      const labels = dftRes.periods.map(p => `${p}분 (${(p / 60).toFixed(1)}h)`);
      if (state.charts.dftPsd) {
        state.charts.dftPsd.data.labels = labels;
        state.charts.dftPsd.data.datasets[0].data = dftRes.psd;
        state.charts.dftPsd.update();
      } else {
        state.charts.dftPsd = new Chart(ctxDft, {
          type: 'bar',
          data: {
            labels,
            datasets: [
              { label: '전력 스펙트럼 밀도 (Power Spectral Density)', data: dftRes.psd, backgroundColor: 'rgba(56, 189, 248, 0.75)' }
            ]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
              x: { ticks: { maxTicksLimit: 14, color: '#94a3b8', font: { size: 10 } }, title: { display: true, text: '주기 (Period)', color: '#94a3b8' } },
              y: { title: { display: true, text: '전력 (PSD)', color: '#94a3b8' }, ticks: { color: '#94a3b8' } }
            }
          }
        });
      }
    }

    // Dominant cycle badge
    const peakInfo = document.getElementById('dominantCycleInfo');
    if (peakInfo && dftRes.dominantPeaks.length > 0) {
      peakInfo.innerHTML = `
        <strong>주요 주기성 성분:</strong>
        1위: <strong>${dftRes.dominantPeaks[0].period}분 (${(dftRes.dominantPeaks[0].period / 60).toFixed(1)}시간 주기)</strong> |
        2위: <strong>${dftRes.dominantPeaks[1].period}분 (${(dftRes.dominantPeaks[1].period / 60).toFixed(1)}시간 주기)</strong> |
        3위: <strong>${dftRes.dominantPeaks[2].period}분</strong>
      `;
    }

    // Tech 20: Autocorrelation (ACF)
    const acfRes = Analytics.autocorrelation(truth, 180);
    const ctxAcf = document.getElementById('acfChart');
    if (ctxAcf) {
      if (state.charts.acf) {
        state.charts.acf.data.labels = acfRes.lags.map(l => `${l}분`);
        state.charts.acf.data.datasets[0].data = acfRes.acf;
        state.charts.acf.update();
      } else {
        state.charts.acf = new Chart(ctxAcf, {
          type: 'line',
          data: {
            labels: acfRes.lags.map(l => `${l}분`),
            datasets: [
              { label: '자기상관함수 (ACF r_k)', data: acfRes.acf, borderColor: '#10b981', backgroundColor: 'rgba(16, 185, 129, 0.1)', fill: true, borderWidth: 2, pointRadius: 0 }
            ]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
              x: { ticks: { maxTicksLimit: 14, color: '#94a3b8' }, title: { display: true, text: '시차 Lag k (분)', color: '#94a3b8' } },
              y: { min: -0.2, max: 1.0, title: { display: true, text: '자기상관계수', color: '#94a3b8' }, ticks: { color: '#94a3b8' } }
            }
          }
        });
      }
    }
  }

  // ==========================================
  // TAB 6: Comprehensive Commentary & Engineering Report
  // ==========================================
  function renderTab6Report() {
    const summary = Analytics.eventStratifiedSummary(state.records);
    const container = document.getElementById('eventSummaryTableBody');
    if (container) {
      container.innerHTML = Object.values(summary).map(s => {
        const meta = EVENT_META[s.name] || { color: '#94a3b8' };
        return `
          <tr>
            <td><span class="event-pill" style="color: ${meta.color}; background: ${meta.color}22">● ${s.name}</span></td>
            <td><strong>${s.count}분</strong> (${s.percent}%)</td>
            <td>${s.avgRawTemp} ± ${s.tempStd} °C</td>
            <td>${s.avgTrueTemp} °C</td>
            <td>${s.avgVibration} ± ${s.vibStd} mm/s</td>
            <td>${s.avgPressure} ± ${s.presStd} kPa</td>
            <td>${s.minMinute} ~ ${s.maxMinute}분</td>
          </tr>
        `;
      }).join('');
    }
  }

  // Export processed data as CSV
  function exportProcessedCsv() {
    if (!state.records || state.records.length === 0) return;
    const header = ['경과시간(분)', '타임스탬프', '온도센서_원시값', '온도_참값', '진동_RMS', '압력', '이벤트', 'SMA_15', '사비츠키골레이', '칼만필터'];
    const rows = state.records.map((r, i) => [
      r.elapsedMinutes,
      r.timestamp,
      r.rawTemp,
      r.trueTemp,
      r.vibration,
      r.pressure,
      r.event,
      fmt(state.filteredSeries.sma[i], 3),
      fmt(state.filteredSeries.sg[i], 3),
      fmt(state.filteredSeries.kalman[i], 3)
    ]);

    const csvContent = '\uFEFF' + [header.join(','), ...rows.map(e => e.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `센서_분석_정제결과_${new Date().toISOString().substring(0, 10)}.csv`;
    link.click();
  }

})();

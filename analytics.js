/**
 * analytics.js
 * 
 * 20 Advanced Analytical Techniques for Industrial IoT Sensor Time-Series Data
 * Pure Client-side, Zero External Requests, High Performance.
 */

(function (window) {
  'use strict';

  const Analytics = {};

  // ==========================================
  // Helper Math Functions
  // ==========================================
  Analytics.mean = function (arr) {
    if (!arr || arr.length === 0) return 0;
    let sum = 0;
    for (let i = 0; i < arr.length; i++) sum += arr[i];
    return sum / arr.length;
  };

  Analytics.variance = function (arr, meanVal) {
    if (!arr || arr.length <= 1) return 0;
    const m = meanVal !== undefined ? meanVal : Analytics.mean(arr);
    let sumSq = 0;
    for (let i = 0; i < arr.length; i++) {
      const diff = arr[i] - m;
      sumSq += diff * diff;
    }
    return sumSq / arr.length;
  };

  Analytics.std = function (arr, meanVal) {
    return Math.sqrt(Analytics.variance(arr, meanVal));
  };

  Analytics.median = function (arr) {
    if (!arr || arr.length === 0) return 0;
    const sorted = arr.slice().sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  };

  Analytics.quantile = function (arr, q) {
    if (!arr || arr.length === 0) return 0;
    const sorted = arr.slice().sort((a, b) => a - b);
    const pos = (sorted.length - 1) * q;
    const base = Math.floor(pos);
    const rest = pos - base;
    if (sorted[base + 1] !== undefined) {
      return sorted[base] + rest * (sorted[base + 1] - sorted[base]);
    }
    return sorted[base];
  };

  // Matrix inversion & multiplication for polynomial fit (Savitzky-Golay)
  function solveLinearSystem(A, b) {
    const n = A.length;
    // Augmented matrix
    const M = [];
    for (let i = 0; i < n; i++) {
      M[i] = A[i].slice();
      M[i].push(b[i]);
    }
    // Forward elimination
    for (let k = 0; k < n; k++) {
      // Find pivot
      let maxRow = k;
      let maxVal = Math.abs(M[k][k]);
      for (let i = k + 1; i < n; i++) {
        if (Math.abs(M[i][k]) > maxVal) {
          maxVal = Math.abs(M[i][k]);
          maxRow = i;
        }
      }
      if (maxRow !== k) {
        const tmp = M[k];
        M[k] = M[maxRow];
        M[maxRow] = tmp;
      }
      if (Math.abs(M[k][k]) < 1e-12) continue;
      for (let i = k + 1; i < n; i++) {
        const factor = M[i][k] / M[k][k];
        for (let j = k; j <= n; j++) {
          M[i][j] -= factor * M[k][j];
        }
      }
    }
    // Backward substitution
    const x = new Array(n).fill(0);
    for (let i = n - 1; i >= 0; i--) {
      let sum = M[i][n];
      for (let j = i + 1; j < n; j++) {
        sum -= M[i][j] * x[j];
      }
      x[i] = M[i][i] !== 0 ? sum / M[i][i] : 0;
    }
    return x;
  }

  // ==========================================
  // Category 1: Time-Series Smoothing & Filtering
  // ==========================================

  /**
   * Technique 1: Simple Moving Average (단순 이동평균, SMA)
   * @param {number[]} data 
   * @param {number} windowSize (e.g. 5, 15, 30, 60)
   * @param {boolean} centered (true for zero-phase centered window)
   */
  Analytics.sma = function (data, windowSize = 15, centered = true) {
    const n = data.length;
    const result = new Array(n);
    const half = Math.floor(windowSize / 2);

    for (let i = 0; i < n; i++) {
      let start, end;
      if (centered) {
        start = Math.max(0, i - half);
        end = Math.min(n - 1, i + half);
      } else {
        start = Math.max(0, i - windowSize + 1);
        end = i;
      }
      let sum = 0;
      let count = 0;
      for (let j = start; j <= end; j++) {
        sum += data[j];
        count++;
      }
      result[i] = count > 0 ? sum / count : data[i];
    }
    return result;
  };

  /**
   * Technique 2: Exponential Moving Average (지수 이동평균, EMA)
   * @param {number[]} data
   * @param {number} alpha (0 < alpha <= 1, or calculated from window: 2 / (window + 1))
   */
  Analytics.ema = function (data, alpha = 0.15) {
    const n = data.length;
    const result = new Array(n);
    if (n === 0) return result;
    result[0] = data[0];
    for (let i = 1; i < n; i++) {
      result[i] = alpha * data[i] + (1 - alpha) * result[i - 1];
    }
    return result;
  };

  /**
   * Technique 3: Savitzky-Golay Filter (사비츠키-골레이 다항식 필터)
   * Local least-squares polynomial convolution. Preserves peaks and inflection points.
   * @param {number[]} data
   * @param {number} windowSize (must be odd, e.g. 11, 15, 21)
   * @param {number} degree (polynomial degree, e.g. 2, 3)
   */
  Analytics.savitzkyGolay = function (data, windowSize = 15, degree = 2) {
    const n = data.length;
    if (windowSize % 2 === 0) windowSize += 1;
    const m = Math.floor(windowSize / 2);
    const cols = degree + 1;

    // Build normal equations for center point convolution weights:
    // J matrix: J[k][j] = (k - m)^j for k = 0..2m, j = 0..degree
    // M = J^T * J
    const M = [];
    for (let r = 0; r < cols; r++) {
      M[r] = new Array(cols).fill(0);
      for (let c = 0; c < cols; c++) {
        let sum = 0;
        for (let k = -m; k <= m; k++) {
          sum += Math.pow(k, r + c);
        }
        M[r][c] = sum;
      }
    }

    // Solve for center weight vector: c = M^-1 * e_0 (where e_0 is [1, 0, 0, ...]^T)
    // weights w_k = sum_j (M^-1)_{0, j} * k^j
    const e0 = new Array(cols).fill(0);
    e0[0] = 1;
    const a = solveLinearSystem(M, e0); // coefficients of polynomial in k

    const weights = new Array(windowSize);
    for (let k = -m; k <= m; k++) {
      let w = 0;
      for (let j = 0; j < cols; j++) {
        w += a[j] * Math.pow(k, j);
      }
      weights[k + m] = w;
    }

    // Apply convolution
    const result = new Array(n);
    for (let i = 0; i < n; i++) {
      if (i < m || i >= n - m) {
        // Fallback for borders: local symmetric or partial window average
        const start = Math.max(0, i - m);
        const end = Math.min(n - 1, i + m);
        let sum = 0, cnt = 0;
        for (let j = start; j <= end; j++) { sum += data[j]; cnt++; }
        result[i] = sum / cnt;
      } else {
        let sum = 0;
        for (let k = -m; k <= m; k++) {
          sum += weights[k + m] * data[i + k];
        }
        result[i] = sum;
      }
    }
    return result;
  };

  /**
   * Technique 4: Median Filter (중앙값 필터)
   * Rank-order filter. Completely eliminates single-spike sensor dropouts without blurring edges.
   * @param {number[]} data
   * @param {number} windowSize (e.g. 5, 9, 15)
   */
  Analytics.medianFilter = function (data, windowSize = 5) {
    const n = data.length;
    const result = new Array(n);
    const half = Math.floor(windowSize / 2);

    for (let i = 0; i < n; i++) {
      const start = Math.max(0, i - half);
      const end = Math.min(n - 1, i + half);
      const slice = [];
      for (let j = start; j <= end; j++) slice.push(data[j]);
      slice.sort((a, b) => a - b);
      const mid = Math.floor(slice.length / 2);
      result[i] = slice.length % 2 !== 0 ? slice[mid] : (slice[mid - 1] + slice[mid]) / 2;
    }
    return result;
  };

  /**
   * Technique 5: Hampel Filter (햄펠 필터 - 3-MAD 기반 국소 이상치 대체)
   * Computes rolling median and MAD. If |x - median| > 3 * 1.4826 * MAD, replaces with median.
   * Leaves non-outlier points mathematically pristine!
   * @param {number[]} data
   * @param {number} windowSize (e.g. 7, 11)
   * @param {number} nSigma (default 3.0)
   */
  Analytics.hampelFilter = function (data, windowSize = 7, nSigma = 3.0) {
    const n = data.length;
    const result = data.slice();
    const half = Math.floor(windowSize / 2);
    const outliers = [];

    for (let i = 0; i < n; i++) {
      const start = Math.max(0, i - half);
      const end = Math.min(n - 1, i + half);
      const windowVals = [];
      for (let j = start; j <= end; j++) windowVals.push(data[j]);
      
      const med = Analytics.median(windowVals);
      const diffs = windowVals.map(v => Math.abs(v - med));
      const mad = Analytics.median(diffs);
      const threshold = nSigma * 1.4826 * mad;

      if (Math.abs(data[i] - med) > threshold && threshold > 1e-6) {
        result[i] = med;
        outliers.push({ index: i, original: data[i], replaced: med });
      }
    }
    return { filtered: result, outliers: outliers };
  };

  /**
   * Technique 6: 1D State-Space Kalman Filter (1차원 상태 공간 칼만 필터)
   * Recursive Bayesian filter balancing system inertia (Q) and measurement noise (R).
   * @param {number[]} data
   * @param {number} Q Process noise variance (default 0.02)
   * @param {number} R Measurement noise variance (default 0.8)
   */
  Analytics.kalmanFilter = function (data, Q = 0.02, R = 0.8) {
    const n = data.length;
    const result = new Array(n);
    if (n === 0) return result;

    let x = data[0]; // estimated state
    let p = 1.0;     // estimated error covariance

    for (let i = 0; i < n; i++) {
      // 1. Predict
      const p_pred = p + Q;

      // 2. Update (Measurement correction)
      const K = p_pred / (p_pred + R); // Kalman gain
      x = x + K * (data[i] - x);
      p = (1.0 - K) * p_pred;

      result[i] = x;
    }
    return result;
  };

  /**
   * Technique 7: Peak Envelope Detection (피크 포락선 분석 - 상·하 포락선)
   * Local rolling maximum and minimum over sliding window.
   * @param {number[]} data
   * @param {number} windowSize (e.g. 30)
   */
  Analytics.peakEnvelope = function (data, windowSize = 30) {
    const n = data.length;
    const upper = new Array(n);
    const lower = new Array(n);
    const half = Math.floor(windowSize / 2);

    for (let i = 0; i < n; i++) {
      const start = Math.max(0, i - half);
      const end = Math.min(n - 1, i + half);
      let maxVal = -Infinity;
      let minVal = Infinity;
      for (let j = start; j <= end; j++) {
        if (data[j] > maxVal) maxVal = data[j];
        if (data[j] < minVal) minVal = data[j];
      }
      upper[i] = maxVal;
      lower[i] = minVal;
    }
    return { upper, lower };
  };

  // ==========================================
  // Category 2: Benchmarking & Signal Quality Assessment
  // ==========================================

  /**
   * Technique 8: Filtering Performance Metrics (스무딩 정량 벤치마크 평가)
   * Compares filtered series against Ground Truth: RMSE, MAE, Max Absolute Error, Correlation r, Peak Error.
   * @param {number[]} filtered
   * @param {number[]} groundTruth
   */
  Analytics.calcErrorMetrics = function (filtered, groundTruth) {
    const n = Math.min(filtered.length, groundTruth.length);
    if (n === 0) return { rmse: 0, mae: 0, maxErr: 0, corr: 0, peakBias: 0 };

    let sumSq = 0;
    let sumAbs = 0;
    let maxErr = 0;
    let maxErrIdx = 0;

    for (let i = 0; i < n; i++) {
      const err = Math.abs(filtered[i] - groundTruth[i]);
      sumSq += err * err;
      sumAbs += err;
      if (err > maxErr) {
        maxErr = err;
        maxErrIdx = i;
      }
    }

    const rmse = Math.sqrt(sumSq / n);
    const mae = sumAbs / n;
    const corr = Analytics.pearsonCorrelation(filtered, groundTruth);

    // Peak bias: compare max value of truth with max value of filtered
    const maxTruth = Math.max(...groundTruth);
    const maxFiltered = Math.max(...filtered);
    const peakBias = maxFiltered - maxTruth;

    return {
      rmse: Number(rmse.toFixed(4)),
      mae: Number(mae.toFixed(4)),
      maxErr: Number(maxErr.toFixed(4)),
      maxErrIdx,
      corr: Number(corr.toFixed(4)),
      peakBias: Number(peakBias.toFixed(4))
    };
  };

  /**
   * Technique 9: SNR & Noise Reduction Ratio (신호 대 잡음비 및 노이즈 감쇄율)
   * Quantifies noise reduction efficiency in decibels (dB) and percentage (%).
   * @param {number[]} raw
   * @param {number[]} filtered
   * @param {number[]} groundTruth
   */
  Analytics.calcNoiseReduction = function (raw, filtered, groundTruth) {
    const n = Math.min(raw.length, filtered.length, groundTruth.length);
    const sigVar = Analytics.variance(groundTruth);

    // Raw noise variance (raw - truth)
    const rawResiduals = [];
    for (let i = 0; i < n; i++) rawResiduals.push(raw[i] - groundTruth[i]);
    const rawNoiseVar = Analytics.variance(rawResiduals);

    // Filtered noise variance (filtered - truth)
    const filtResiduals = [];
    for (let i = 0; i < n; i++) filtResiduals.push(filtered[i] - groundTruth[i]);
    const filtNoiseVar = Analytics.variance(filtResiduals);

    const rawSnrDb = rawNoiseVar > 0 ? 10 * Math.log10(sigVar / rawNoiseVar) : 0;
    const filtSnrDb = filtNoiseVar > 0 ? 10 * Math.log10(sigVar / filtNoiseVar) : 0;
    const snrGainDb = filtSnrDb - rawSnrDb;

    // Noise attenuation ratio: (1 - filt_std / raw_std) * 100%
    const rawStd = Math.sqrt(rawNoiseVar);
    const filtStd = Math.sqrt(filtNoiseVar);
    const noiseReductionPct = rawStd > 0 ? Math.max(0, (1 - filtStd / rawStd) * 100) : 0;

    return {
      rawSnrDb: Number(rawSnrDb.toFixed(2)),
      filtSnrDb: Number(filtSnrDb.toFixed(2)),
      snrGainDb: Number(snrGainDb.toFixed(2)),
      noiseReductionPct: Number(noiseReductionPct.toFixed(1))
    };
  };

  // ==========================================
  // Category 3: Anomaly Detection & Statistical Process Control
  // ==========================================

  /**
   * Technique 10: Rolling Z-Score Anomaly Detection (이동 Z-Score 이상치 탐지)
   * |x_t - mu_t| / sigma_t > threshold
   * @param {number[]} data
   * @param {number} windowSize (default 30)
   * @param {number} threshold (default 3.0)
   */
  Analytics.rollingZScore = function (data, windowSize = 30, threshold = 3.0) {
    const n = data.length;
    const scores = new Array(n);
    const anomalies = [];
    const half = Math.floor(windowSize / 2);

    for (let i = 0; i < n; i++) {
      const start = Math.max(0, i - half);
      const end = Math.min(n - 1, i + half);
      const win = [];
      for (let j = start; j <= end; j++) win.push(data[j]);

      const m = Analytics.mean(win);
      const s = Analytics.std(win, m);

      if (s > 1e-5) {
        const z = (data[i] - m) / s;
        scores[i] = z;
        if (Math.abs(z) >= threshold) {
          anomalies.push({ index: i, value: data[i], score: z });
        }
      } else {
        scores[i] = 0;
      }
    }
    return { scores, anomalies };
  };

  /**
   * Technique 11: Interquartile Range (IQR) Outlier Rule (IQR 사분위 기반 이상치 판별)
   * Boundaries: Q1 - 1.5 * IQR and Q3 + 1.5 * IQR
   * @param {number[]} data
   * @param {number} multiplier (default 1.5)
   */
  Analytics.iqrAnomaly = function (data, multiplier = 1.5) {
    const q1 = Analytics.quantile(data, 0.25);
    const q3 = Analytics.quantile(data, 0.75);
    const iqr = q3 - q1;
    const lower = q1 - multiplier * iqr;
    const upper = q3 + multiplier * iqr;

    const anomalies = [];
    for (let i = 0; i < data.length; i++) {
      if (data[i] < lower || data[i] > upper) {
        anomalies.push({ index: i, value: data[i], bound: data[i] < lower ? 'lower' : 'upper' });
      }
    }
    return { q1, q3, iqr, lower, upper, anomalies };
  };

  /**
   * Technique 12: Statistical Process Control - EWMA Control Chart (통계적 공정 관리 EWMA 관리도)
   * Center line: mu_0, Control limits: UCL/LCL = mu_0 +/- L * sigma * sqrt(lambda / (2 - lambda) * [1 - (1 - lambda)^(2t)])
   * @param {number[]} data
   * @param {number} lambda (default 0.2)
   * @param {number} L (sigma multiplier, default 3.0)
   */
  Analytics.ewmaControlChart = function (data, lambda = 0.2, L = 3.0) {
    const n = data.length;
    const cl = Analytics.mean(data);
    const sigma = Analytics.std(data, cl);

    const ewma = new Array(n);
    const ucl = new Array(n);
    const lcl = new Array(n);
    const violations = [];

    let z = cl;
    for (let t = 0; t < n; t++) {
      z = lambda * data[t] + (1 - lambda) * z;
      ewma[t] = z;

      // Dynamic control limits expanding from center line
      const factor = Math.sqrt((lambda / (2 - lambda)) * (1 - Math.pow(1 - lambda, 2 * (t + 1))));
      const limitDist = L * sigma * factor;
      ucl[t] = cl + limitDist;
      lcl[t] = cl - limitDist;

      if (z > ucl[t] || z < lcl[t]) {
        violations.push({ index: t, value: z, limit: z > ucl[t] ? ucl[t] : lcl[t] });
      }
    }
    return { cl, sigma, ewma, ucl, lcl, violations };
  };

  /**
   * Technique 13: Cumulative Sum Control Chart (누적합 관리도, CUSUM)
   * Detects small, persistent shifts in machine load or temperature.
   * C+_t = max(0, C+_{t-1} + (x_t - target - k))
   * C-_t = max(0, C-_{t-1} - (x_t - target + k))
   * @param {number[]} data
   * @param {number} target (target mean, or overall mean)
   * @param {number} k (allowance / slack, default 0.5 * sigma)
   * @param {number} h (decision threshold, default 4.0 * sigma)
   */
  Analytics.cusum = function (data, target = null, k = null, h = null) {
    const n = data.length;
    const mu = target !== null ? target : Analytics.mean(data);
    const sigma = Analytics.std(data, mu);

    const slack = k !== null ? k : 0.5 * sigma;
    const threshold = h !== null ? h : 4.0 * sigma;

    const posCusum = new Array(n);
    const negCusum = new Array(n);
    const violations = [];

    let cPos = 0;
    let cNeg = 0;

    for (let t = 0; t < n; t++) {
      cPos = Math.max(0, cPos + (data[t] - mu - slack));
      cNeg = Math.max(0, cNeg - (data[t] - mu + slack));

      posCusum[t] = cPos;
      negCusum[t] = cNeg;

      if (cPos > threshold || cNeg > threshold) {
        violations.push({ index: t, pos: cPos, neg: cNeg, direction: cPos > threshold ? 'upward' : 'downward' });
      }
    }
    return { target: mu, sigma, slack, threshold, posCusum, negCusum, violations };
  };

  /**
   * Technique 14: Anomaly Detection Performance Benchmarking (정답 이벤트와 알고리즘 탐지 성능 정량 평가)
   * Precision, Recall, F1-Score, Confusion Matrix against true event markers.
   * @param {number[]} detectedIndices (indices flagged by algorithm)
   * @param {number[]} trueEventIndices (indices labeled as abnormal in dataset)
   * @param {number} totalCount (1440)
   * @param {number} tolerance (time window tolerance in minutes, default 1)
   */
  Analytics.evaluateAnomalies = function (detectedIndices, trueEventIndices, totalCount = 1440, tolerance = 1) {
    const trueSet = new Set(trueEventIndices);
    const detSet = new Set(detectedIndices);

    let tp = 0;
    let fp = 0;

    for (const d of detSet) {
      let matched = false;
      for (let offset = -tolerance; offset <= tolerance; offset++) {
        if (trueSet.has(d + offset)) {
          matched = true;
          break;
        }
      }
      if (matched) tp++;
      else fp++;
    }

    let fn = 0;
    for (const t of trueSet) {
      let matched = false;
      for (let offset = -tolerance; offset <= tolerance; offset++) {
        if (detSet.has(t + offset)) {
          matched = true;
          break;
        }
      }
      if (!matched) fn++;
    }

    const p = tp + fp > 0 ? tp / (tp + fp) : 0;
    const r = tp + fn > 0 ? tp / (tp + fn) : 0;
    const f1 = p + r > 0 ? (2 * p * r) / (p + r) : 0;
    const accuracy = (totalCount - (fp + fn)) / totalCount;

    return {
      tp,
      fp,
      fn,
      tn: totalCount - (tp + fp + fn),
      precision: Number((p * 100).toFixed(1)),
      recall: Number((r * 100).toFixed(1)),
      f1: Number(f1.toFixed(3)),
      accuracy: Number((accuracy * 100).toFixed(1))
    };
  };

  // ==========================================
  // Category 4: Multivariate Correlation & System Dynamics
  // ==========================================

  /**
   * Technique 15: Multivariate Pearson & Spearman Correlation (다변량 피어슨 및 스피어만 상관계수)
   * @param {number[]} x
   * @param {number[]} y
   */
  Analytics.pearsonCorrelation = function (x, y) {
    const n = Math.min(x.length, y.length);
    if (n === 0) return 0;
    const mx = Analytics.mean(x);
    const my = Analytics.mean(y);
    let num = 0, denX = 0, denY = 0;
    for (let i = 0; i < n; i++) {
      const dx = x[i] - mx;
      const dy = y[i] - my;
      num += dx * dy;
      denX += dx * dx;
      denY += dy * dy;
    }
    const den = Math.sqrt(denX * denY);
    return den > 0 ? num / den : 0;
  };

  Analytics.spearmanCorrelation = function (x, y) {
    const n = Math.min(x.length, y.length);
    if (n === 0) return 0;
    // Rank array helper
    function getRanks(arr) {
      const indexed = arr.map((val, idx) => ({ val, idx }));
      indexed.sort((a, b) => a.val - b.val);
      const ranks = new Array(n);
      for (let i = 0; i < n; i++) {
        ranks[indexed[i].idx] = i + 1;
      }
      return ranks;
    }
    const rankX = getRanks(x);
    const rankY = getRanks(y);
    return Analytics.pearsonCorrelation(rankX, rankY);
  };

  /**
   * Technique 16: Cross-Correlation & Lag Lead/Lag Analysis (상호상관 시차 분석 및 선행 지표 탐색)
   * R_xy(tau) across tau in [-maxLag, +maxLag]
   * @param {number[]} x (e.g. Vibration or Pressure)
   * @param {number[]} y (e.g. Temperature)
   * @param {number} maxLag (default 60 minutes)
   */
  Analytics.crossCorrelation = function (x, y, maxLag = 60) {
    const n = Math.min(x.length, y.length);
    const mx = Analytics.mean(x);
    const my = Analytics.mean(y);
    const sx = Analytics.std(x, mx);
    const sy = Analytics.std(y, my);

    const lags = [];
    const correlations = [];
    let maxR = -Infinity;
    let bestLag = 0;

    for (let tau = -maxLag; tau <= maxLag; tau++) {
      let sum = 0;
      let count = 0;
      for (let t = 0; t < n; t++) {
        const t2 = t + tau;
        if (t2 >= 0 && t2 < n) {
          sum += (x[t] - mx) * (y[t2] - my);
          count++;
        }
      }
      const r = count > 0 && sx * sy > 0 ? sum / (count * sx * sy) : 0;
      lags.push(tau);
      correlations.push(Number(r.toFixed(4)));

      if (r > maxR) {
        maxR = r;
        bestLag = tau;
      }
    }
    return { lags, correlations, maxR: Number(maxR.toFixed(4)), bestLag };
  };

  /**
   * Technique 17: Rolling Dynamic Cross-Correlation (구간별 동적 롤링 상관도 분석)
   * Dynamic correlation over time to detect regime transitions and coupling shifts.
   * @param {number[]} x
   * @param {number[]} y
   * @param {number} windowSize (default 60 minutes)
   */
  Analytics.rollingCorrelation = function (x, y, windowSize = 60) {
    const n = Math.min(x.length, y.length);
    const result = new Array(n);
    const half = Math.floor(windowSize / 2);

    for (let i = 0; i < n; i++) {
      const start = Math.max(0, i - half);
      const end = Math.min(n - 1, i + half);
      const subX = [];
      const subY = [];
      for (let j = start; j <= end; j++) {
        subX.push(x[j]);
        subY.push(y[j]);
      }
      result[i] = Number(Analytics.pearsonCorrelation(subX, subY).toFixed(3));
    }
    return result;
  };

  /**
   * Technique 18: Multivariate Phase Space & State Trajectory (위상 공간 상태 궤적 분석)
   * Standardized Z-scores to project multi-sensor dynamics into a 2D state space.
   * @param {number[]} temp
   * @param {number[]} vib
   * @param {number[]} pres
   * @param {string[]} events
   */
  Analytics.phaseSpaceTrajectory = function (temp, vib, pres, events) {
    const n = temp.length;
    const mt = Analytics.mean(temp), st = Analytics.std(temp, mt);
    const mv = Analytics.mean(vib), sv = Analytics.std(vib, mv);
    const mp = Analytics.mean(pres), sp = Analytics.std(pres, mp);

    const points = [];
    for (let i = 0; i < n; i++) {
      points.push({
        minute: i,
        zTemp: st > 0 ? (temp[i] - mt) / st : 0,
        zVib: sv > 0 ? (vib[i] - mv) / sv : 0,
        zPres: sp > 0 ? (pres[i] - mp) / sp : 0,
        event: events ? events[i] : '정상'
      });
    }
    return { points };
  };

  // ==========================================
  // Category 5: Frequency & Spectral Analysis
  // ==========================================

  /**
   * Technique 19: Discrete Fourier Transform / Power Spectral Density (DFT / PSD 주파수 분석)
   * Computes power spectrum and identifies dominant machine periodicity (hours & minutes).
   * @param {number[]} data
   * @param {number} sampleIntervalMinutes (1)
   * @param {number} maxFreqBins (default 120 bins)
   */
  Analytics.discreteFourierTransform = function (data, sampleIntervalMinutes = 1, maxFreqBins = 120) {
    const n = data.length;
    const meanVal = Analytics.mean(data);
    // Detrend / remove DC mean
    const x = data.map(v => v - meanVal);

    const frequencies = [];
    const periods = [];
    const psd = [];
    const amplitudes = [];

    // Evaluate up to maxFreqBins (frequencies: k / (N * dt))
    for (let k = 1; k <= maxFreqBins; k++) {
      let real = 0;
      let imag = 0;
      const angle = (2 * Math.PI * k) / n;

      for (let t = 0; t < n; t++) {
        real += x[t] * Math.cos(angle * t);
        imag -= x[t] * Math.sin(angle * t);
      }

      const power = (real * real + imag * imag) / n;
      const amplitude = (2 * Math.sqrt(power * n)) / n;
      const freqPerDay = (k / n) * 1440; // cycles per 24 hours
      const periodMinutes = n / k;

      frequencies.push(Number(freqPerDay.toFixed(2)));
      periods.push(Number(periodMinutes.toFixed(1)));
      psd.push(Number(power.toFixed(4)));
      amplitudes.push(Number(amplitude.toFixed(4)));
    }

    // Find top 3 dominant peaks
    const indexed = psd.map((val, idx) => ({ val, period: periods[idx], freq: frequencies[idx] }));
    indexed.sort((a, b) => b.val - a.val);
    const dominantPeaks = indexed.slice(0, 3);

    return { frequencies, periods, psd, amplitudes, dominantPeaks };
  };

  /**
   * Technique 20: Autocorrelation Function (ACF / 자기상관함수 분석)
   * Computes ACF for lags up to maxLag (e.g. 180 min / 3 hrs).
   * Reveals cyclical memory, thermal time constants, and harmonic structure.
   * @param {number[]} data
   * @param {number} maxLag (default 180)
   */
  Analytics.autocorrelation = function (data, maxLag = 180) {
    const n = data.length;
    const m = Analytics.mean(data);
    const variance = Analytics.variance(data, m);

    const lags = [];
    const acf = [];

    for (let lag = 0; lag <= maxLag; lag++) {
      let sum = 0;
      for (let t = 0; t < n - lag; t++) {
        sum += (data[t] - m) * (data[t + lag] - m);
      }
      const val = variance > 0 ? sum / ((n - lag) * variance) : 0;
      lags.push(lag);
      acf.push(Number(val.toFixed(4)));
    }

    // Find first local minimum and subsequent secondary peak (cycle period)
    let firstPeakLag = null;
    for (let i = 2; i < acf.length - 1; i++) {
      if (acf[i] > acf[i - 1] && acf[i] > acf[i + 1] && acf[i] > 0.2) {
        firstPeakLag = lags[i];
        break;
      }
    }

    return { lags, acf, firstPeakLag };
  };

  // ==========================================
  // Category 6: Regime Diagnostics & Interpretation Engine
  // ==========================================

  /**
   * Diagnostic Module: Event-Stratified Summary Statistics
   * Calculates conditional means, variance, percentiles per operating regime.
   * @param {Array<Object>} records
   */
  Analytics.eventStratifiedSummary = function (records) {
    const groups = {};
    for (const r of records) {
      const ev = r.event || '정상';
      if (!groups[ev]) {
        groups[ev] = { count: 0, rawTemps: [], trueTemps: [], vibs: [], pres: [], minutes: [] };
      }
      groups[ev].count++;
      groups[ev].rawTemps.push(r.rawTemp);
      groups[ev].trueTemps.push(r.trueTemp);
      groups[ev].vibs.push(r.vibration);
      groups[ev].pres.push(r.pressure);
      groups[ev].minutes.push(r.elapsedMinutes);
    }

    const summary = {};
    for (const ev in groups) {
      const g = groups[ev];
      summary[ev] = {
        name: ev,
        count: g.count,
        percent: Number(((g.count / records.length) * 100).toFixed(2)),
        avgRawTemp: Number(Analytics.mean(g.rawTemps).toFixed(2)),
        avgTrueTemp: Number(Analytics.mean(g.trueTemps).toFixed(2)),
        tempStd: Number(Analytics.std(g.rawTemps).toFixed(2)),
        avgVibration: Number(Analytics.mean(g.vibs).toFixed(2)),
        vibStd: Number(Analytics.std(g.vibs).toFixed(2)),
        avgPressure: Number(Analytics.mean(g.pres).toFixed(2)),
        presStd: Number(Analytics.std(g.pres).toFixed(2)),
        minMinute: Math.min(...g.minutes),
        maxMinute: Math.max(...g.minutes)
      };
    }
    return summary;
  };

  // Expose to window
  window.Analytics = Analytics;
})(typeof window !== 'undefined' ? window : this);

// CMP Simulator Logic and Visualizers

// Status Level Enum
const StatusLevel = {
    NORMAL: 'NORMAL',
    WARNING: 'WARNING',
    DANGER: 'DANGER',
    READY: 'READY'
};

// Parameter Normal Ranges
const Ranges = {
    carrierPressure: { min: 2.0, max: 6.0 },
    platenSpeed: { min: 30.0, max: 120.0 },
    carrierSpeed: { min: 30.0, max: 120.0 },
    slurryFlow: { min: 100.0, max: 300.0 },
    condPressure: { min: 2.0, max: 6.0 },
    condSpeed: { min: 40.0, max: 120.0 },
    polishTime: { min: 30.0, max: 120.0 }
};

// UI Elements
const els = {
    carrierPressure: document.getElementById('carrierPressure'),
    platenSpeed: document.getElementById('platenSpeed'),
    carrierSpeed: document.getElementById('carrierSpeed'),
    slurryFlow: document.getElementById('slurryFlow'),
    condPressure: document.getElementById('condPressure'),
    condSpeed: document.getElementById('condSpeed'),
    polishTime: document.getElementById('polishTime'),
    
    distTotalWafers: document.getElementById('distTotalWafers'),
    distNormal: document.getElementById('distNormal'),
    distSlurry: document.getElementById('distSlurry'),
    distCond: document.getElementById('distCond'),
    distPressure: document.getElementById('distPressure'),
    distTotalCount: document.getElementById('distTotalCount'),
    distValidationMsg: document.getElementById('distValidationMsg'),
    
    summaryTotal: document.getElementById('summaryTotal'),
    summaryGood: document.getElementById('summaryGood'),
    summaryBad: document.getElementById('summaryBad'),
    summaryYield: document.getElementById('summaryYield'),
    
    statusBadge: document.getElementById('statusBadge'),
    statusExplanation: document.getElementById('statusExplanation'),
    
    resTemp: document.getElementById('resTemp'),
    resRR: document.getElementById('resRR'),
    
    btnSimulate: document.getElementById('btnSimulate'),
    btnSaveLog: document.getElementById('btnSaveLog'),
    btnReset: document.getElementById('btnReset'),
    btnRangeInfo: document.getElementById('btnRangeInfo'),
    
    progressLabel: document.getElementById('progressLabel'),
    progressBarFill: document.getElementById('progressBarFill'),
    logTableBody: document.getElementById('logTableBody'),
    headerClock: document.getElementById('headerClock'),
    
    // Modal
    rangeModal: document.getElementById('rangeModal'),
    btnCloseModal: document.getElementById('btnCloseModal'),
    btnCloseModalBtn: document.getElementById('btnCloseModalBtn'),
    
    // Canvases
    gaugeCanvas: document.getElementById('gaugeCanvas'),
    chartCanvas: document.getElementById('chartCanvas')
};

// Simulation State
let isSimulating = false;
let simulationInterval = null;
let currentTime = 0; // Elapsed seconds for current wafer
let totalTime = 60;  // Polish time for current wafer
let simulatedRecipe = null;
let simulatedOutputs = {
    temp: 25.0,
    rr: 0.0,
    uniformity: 99.5
};

// FOUP Batch State
let waferBatch = [];      // Array of 25 items containing { waferNo, scenarioIndex }
let currentWaferIdx = 0;  // Index of currently simulating wafer (0 to 24)
let goodCount = 0;
let badCount = 0;
let yieldPct = 0.0;

let logHistory = [];
let chartData = []; // Trend data across the 25 wafers: array of {t: waferNo, temp, rr, uniformity}
let nextLogId = 1;

// Animated Gauge State
let targetGaugeValue = 98.3;
let currentGaugeValue = 90.0;
let gaugeAnimId = null;

// Clock updates
setInterval(() => {
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    els.headerClock.textContent = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
}, 1000);

// Initialize Canvases
const ctxGauge = els.gaugeCanvas.getContext('2d');
const ctxChart = els.chartCanvas.getContext('2d');

// --- Visualizer 1: Circular Gauge Rendering ---
function initGaugeAnimation() {
    function animate() {
        const diff = targetGaugeValue - currentGaugeValue;
        if (Math.abs(diff) < 0.02) {
            currentGaugeValue = targetGaugeValue;
        } else {
            currentGaugeValue += diff * 0.15; // interpolation step
        }
        
        drawGauge(currentGaugeValue);
        
        if (isSimulating || Math.abs(diff) >= 0.02) {
            gaugeAnimId = requestAnimationFrame(animate);
        } else {
            cancelAnimationFrame(gaugeAnimId);
            gaugeAnimId = null;
        }
    }
    
    if (!gaugeAnimId) {
        animate();
    }
}

function drawGauge(value) {
    const w = els.gaugeCanvas.width;
    const h = els.gaugeCanvas.height;
    ctxGauge.clearRect(0, 0, w, h);
    
    const cx = w / 2;
    const cy = h / 2 + 10;
    const radius = Math.min(w, h) / 2 - 25;
    
    const startAngle = 0.75 * Math.PI; // 135 degrees (bottom left)
    const endAngle = 2.25 * Math.PI;   // 405 degrees (bottom right)
    const totalSweep = 1.5 * Math.PI;   // 270 degrees
    
    const arcWidth = 10;
    
    // Draw Background Arc Bands
    // Normal Range is 98% ~ 100% -> Green
    // Warning Range is 95% ~ 98% -> Yellow
    // Danger Range is 90% ~ 95% -> Red
    
    // Draw Red (90% to 95% - covers 50% of the gauge scale)
    ctxGauge.beginPath();
    ctxGauge.arc(cx, cy, radius, startAngle, startAngle + totalSweep * 0.5);
    ctxGauge.lineWidth = arcWidth;
    ctxGauge.strokeStyle = '#ef4444'; // Red
    ctxGauge.lineCap = 'round';
    ctxGauge.stroke();
    
    // Draw Yellow (95% to 98% - covers 30% of scale)
    ctxGauge.beginPath();
    ctxGauge.arc(cx, cy, radius, startAngle + totalSweep * 0.5, startAngle + totalSweep * 0.8);
    ctxGauge.lineWidth = arcWidth;
    ctxGauge.strokeStyle = '#f59e0b'; // Yellow
    ctxGauge.lineCap = 'butt';
    ctxGauge.stroke();
    
    // Draw Green (98% to 100% - covers 20% of scale)
    ctxGauge.beginPath();
    ctxGauge.arc(cx, cy, radius, startAngle + totalSweep * 0.8, endAngle);
    ctxGauge.lineWidth = arcWidth;
    ctxGauge.strokeStyle = '#10b981'; // Green
    ctxGauge.lineCap = 'round';
    ctxGauge.stroke();
    
    // Draw Ticks & Labels (90, 95, 100)
    const ticks = [90, 95, 100];
    ctxGauge.font = 'bold 11px Outfit, Noto Sans KR';
    ctxGauge.fillStyle = '#94a3b8';
    ctxGauge.textAlign = 'center';
    ctxGauge.textBaseline = 'middle';
    
    ticks.forEach(t => {
        const ratio = (t - 90) / 10;
        const angle = startAngle + ratio * totalSweep;
        
        // Tick mark line
        const rStart = radius - arcWidth - 2;
        const rEnd = radius + 2;
        const xStart = cx + rStart * Math.cos(angle);
        const yStart = cy + rStart * Math.sin(angle);
        const xEnd = cx + rEnd * Math.cos(angle);
        const yEnd = cy + rEnd * Math.sin(angle);
        
        ctxGauge.beginPath();
        ctxGauge.moveTo(xStart, yStart);
        ctxGauge.lineTo(xEnd, yEnd);
        ctxGauge.lineWidth = 2;
        ctxGauge.strokeStyle = '#334155';
        ctxGauge.stroke();
        
        // Tick label
        const rLabel = radius - arcWidth - 14;
        const xl = cx + rLabel * Math.cos(angle);
        const yl = cy + rLabel * Math.sin(angle);
        ctxGauge.fillText(String(t), xl, yl);
    });
    
    // Draw Needle (representing current value)
    const needleVal = Math.max(90, Math.min(100, value));
    const needleRatio = (needleVal - 90) / 10;
    const needleAngle = startAngle + needleRatio * totalSweep;
    const needleLength = radius * 0.82;
    
    const nx = cx + needleLength * Math.cos(needleAngle);
    const ny = cy + needleLength * Math.sin(needleAngle);
    
    ctxGauge.beginPath();
    ctxGauge.moveTo(cx, cy);
    ctxGauge.lineTo(nx, ny);
    ctxGauge.lineWidth = 3;
    ctxGauge.strokeStyle = '#ef4444'; // Red pointer
    ctxGauge.lineCap = 'round';
    ctxGauge.stroke();
    
    // Draw Center Bezel
    ctxGauge.beginPath();
    ctxGauge.arc(cx, cy, 7, 0, 2 * Math.PI);
    ctxGauge.fillStyle = '#1e293b';
    ctxGauge.fill();
    ctxGauge.beginPath();
    ctxGauge.arc(cx, cy, 7, 0, 2 * Math.PI);
    ctxGauge.lineWidth = 2;
    ctxGauge.strokeStyle = '#cbd5e1';
    ctxGauge.stroke();
    
    // Draw Value text in the center-bottom
    ctxGauge.font = 'bold 20px Outfit';
    ctxGauge.fillStyle = '#ffffff';
    ctxGauge.textAlign = 'center';
    ctxGauge.fillText(`${value.toFixed(1)} %`, cx, cy + radius * 0.65);
}

// --- Visualizer 2: Real-time Chart Rendering ---
function drawChart() {
    const w = els.chartCanvas.width;
    const h = els.chartCanvas.height;
    ctxChart.clearRect(0, 0, w, h);
    
    // Plot configuration
    const leftMargin = 38;
    const rightMargin = 12;
    const topMargin = 25;
    const bottomMargin = 22;
    
    const pw = w - leftMargin - rightMargin;
    const ph = h - topMargin - bottomMargin;
    
    if (pw <= 0 || ph <= 0) return;
    
    // Draw background grid lines
    ctxChart.strokeStyle = '#1e293b';
    ctxChart.lineWidth = 1;
    ctxChart.setLineDash([3, 3]);
    
    // Horizontal lines (0%, 25%, 50%, 75%, 100%)
    for (let i = 0; i <= 4; i++) {
        const y = topMargin + ph - (i * ph / 4);
        ctxChart.beginPath();
        ctxChart.moveTo(leftMargin, y);
        ctxChart.lineTo(leftMargin + pw, y);
        ctxChart.stroke();
        
        // Axis label
        ctxChart.fillStyle = '#64748b';
        ctxChart.font = '9px Outfit';
        ctxChart.textAlign = 'right';
        ctxChart.textBaseline = 'middle';
        ctxChart.setLineDash([]);
        ctxChart.fillText(`${i * 25}%`, leftMargin - 6, y);
        ctxChart.setLineDash([3, 3]);
    }
    
    // Vertical lines (based on totalWafers in FOUP)
    const tMax = els && els.distTotalWafers ? (parseInt(els.distTotalWafers.value) || 25) : 25;
    
    // Choose step size dynamically based on tMax to avoid label clutter
    let step = 5;
    if (tMax <= 10) step = 1;
    else if (tMax <= 30) step = 5;
    else if (tMax <= 100) step = 10;
    else step = 20;
    
    for (let wNo = 1; wNo <= tMax; wNo++) {
        // Draw gridline for first, last, and step-intervals
        if (wNo === 1 || wNo === tMax || wNo % step === 0) {
            const x = leftMargin + ((wNo - 1) * pw / Math.max(1, tMax - 1));
            ctxChart.beginPath();
            ctxChart.moveTo(x, topMargin);
            ctxChart.lineTo(x, topMargin + ph);
            ctxChart.stroke();
            
            // Wafer labels
            ctxChart.fillStyle = '#64748b';
            ctxChart.font = '9px Outfit';
            ctxChart.textAlign = 'center';
            ctxChart.textBaseline = 'top';
            ctxChart.setLineDash([]);
            ctxChart.fillText(`#${wNo}`, x, topMargin + ph + 3);
            ctxChart.setLineDash([3, 3]);
        }
    }
    ctxChart.setLineDash([]);
    
    // Draw Chart frame
    ctxChart.strokeStyle = '#334155';
    ctxChart.lineWidth = 1;
    ctxChart.strokeRect(leftMargin, topMargin, pw, ph);
    
    // Plot lines if we have data points
    if (chartData.length > 0) {
        const tempColor = '#00d2d3';
        const rrColor = '#ff9f43';
        const uniColor = '#9b59b6';
        
        // Helper to map normalized y to chart coordinates
        const getY = (val) => topMargin + ph - (val * ph);
        // Map waferNo (1 to totalWafers) to X coordinate
        const getX = (waferNum) => leftMargin + ((waferNum - 1) * pw / Math.max(1, tMax - 1));
        
        // Draw points and lines
        // 1. Plot Temperature
        ctxChart.beginPath();
        chartData.forEach((d, idx) => {
            const normY = Math.max(0, Math.min(1, (d.temp - 20) / 40)); // 20-60 range
            const x = getX(d.t);
            const y = getY(normY);
            if (idx === 0) ctxChart.moveTo(x, y);
            else ctxChart.lineTo(x, y);
        });
        ctxChart.strokeStyle = tempColor;
        ctxChart.lineWidth = 1.8;
        ctxChart.stroke();
        
        // 1b. Draw little circles at each point for visibility
        chartData.forEach((d) => {
            const normY = Math.max(0, Math.min(1, (d.temp - 20) / 40));
            ctxChart.beginPath();
            ctxChart.arc(getX(d.t), getY(normY), 2.5, 0, 2 * Math.PI);
            ctxChart.fillStyle = tempColor;
            ctxChart.fill();
        });
        
        // 2. Plot Removal Rate
        ctxChart.beginPath();
        chartData.forEach((d, idx) => {
            const normY = Math.max(0, Math.min(1, d.rr / 4000)); // 0-4000 range
            const x = getX(d.t);
            const y = getY(normY);
            if (idx === 0) ctxChart.moveTo(x, y);
            else ctxChart.lineTo(x, y);
        });
        ctxChart.strokeStyle = rrColor;
        ctxChart.lineWidth = 1.8;
        ctxChart.stroke();
        
        // 2b. Draw circles
        chartData.forEach((d) => {
            const normY = Math.max(0, Math.min(1, d.rr / 4000));
            ctxChart.beginPath();
            ctxChart.arc(getX(d.t), getY(normY), 2.5, 0, 2 * Math.PI);
            ctxChart.fillStyle = rrColor;
            ctxChart.fill();
        });
        
        // 3. Plot Uniformity
        ctxChart.beginPath();
        chartData.forEach((d, idx) => {
            const normY = Math.max(0, Math.min(1, (d.uniformity - 80) / 20)); // 80-100 range
            const x = getX(d.t);
            const y = getY(normY);
            if (idx === 0) ctxChart.moveTo(x, y);
            else ctxChart.lineTo(x, y);
        });
        ctxChart.strokeStyle = uniColor;
        ctxChart.lineWidth = 1.8;
        ctxChart.stroke();
        
        // 3b. Draw circles
        chartData.forEach((d) => {
            const normY = Math.max(0, Math.min(1, (d.uniformity - 80) / 20));
            ctxChart.beginPath();
            ctxChart.arc(getX(d.t), getY(normY), 2.5, 0, 2 * Math.PI);
            ctxChart.fillStyle = uniColor;
            ctxChart.fill();
        });
    }
    
    // Draw Legends at the top
    const legX = leftMargin + 8;
    const legY = 6;
    const spacing = 65;
    
    // Temp
    ctxChart.fillStyle = '#00d2d3';
    ctxChart.fillRect(legX, legY + 2, 7, 5);
    ctxChart.font = 'bold 8.5px Outfit';
    ctxChart.fillText('Temp (20-60°C)', legX + 10, legY + 5);
    
    // RR
    ctxChart.fillStyle = '#ff9f43';
    ctxChart.fillRect(legX + spacing * 1.05, legY + 2, 7, 5);
    ctxChart.fillText('RR (0-4k)', legX + spacing * 1.05 + 10, legY + 5);
    
    // Uniformity
    ctxChart.fillStyle = '#9b59b6';
    ctxChart.fillRect(legX + spacing * 1.85, legY + 2, 7, 5);
    ctxChart.fillText('Uniform (80-100%)', legX + spacing * 1.85 + 10, legY + 5);
}

// --- Simulator Calculations (Time-Series Physical Model) ---
function simulateStep(t, recipe, scenario) {
    // Current input parameters that can change dynamically based on the scenario
    let p = recipe.carrierPressure;
    let platenSpeed = recipe.platenSpeed;
    let carrierSpeed = recipe.carrierSpeed;
    let slurryFlow = recipe.slurryFlow;
    let condPressure = recipe.condPressure;
    let condSpeed = recipe.condSpeed;
    
    // Apply Scenario transitions
    if (scenario === 1) { // Slurry Warning (drops 220 -> 130 after 30s)
        if (t > 30) {
            const ratio = Math.min(1.0, (t - 30) / 20.0); // drop over 20s
            slurryFlow = 220.0 - ratio * (220.0 - 130.0);
        }
    } else if (scenario === 2) { // Conditioner Warning (drops 80 -> 40 after 20s)
        if (t > 20) {
            const ratio = Math.min(1.0, (t - 20) / 30.0); // drop over 30s
            condSpeed = 80.0 - ratio * (80.0 - 40.0);
        }
    } else if (scenario === 3) { // Carrier Pressure Danger (rises 3.5 -> 6.5 after 20s)
        if (t > 20) {
            const ratio = Math.min(1.0, (t - 20) / 20.0); // rise over 20s
            p = 3.5 + ratio * (6.5 - 3.5);
        }
    }
    
    // Apply Startup Ramp-up (0-10 seconds)
    if (t <= 10) {
        const startupRatio = t / 10.0;
        p *= startupRatio;
        platenSpeed *= startupRatio;
        carrierSpeed *= startupRatio;
        slurryFlow *= startupRatio;
        condPressure *= startupRatio;
        condSpeed *= startupRatio;
    }
    
    // 1. Temperature model (base heat + friction + cooling)
    let tempTarget = 24.4 + (p * 3.2) + (platenSpeed * 0.08) - (slurryFlow * 0.04);
    if (slurryFlow < 150.0 && t > 10) {
        tempTarget += (150.0 - slurryFlow) * 0.08;
    }
    
    // Thermal inertia interpolation
    let targetTemp = t <= 10 
        ? 25.0 + (tempTarget - 25.0) * (t / 10.0)
        : tempTarget;
    
    simulatedOutputs.temp += (targetTemp - simulatedOutputs.temp) * 0.2;
    
    // 2. Removal Rate model (with saturation at high pressure)
    const pressureFactor = p <= 4.0 ? p : (4.0 + (p - 4.0) * 0.35);
    
    let slurryMultiplier = slurryFlow >= 200.0 ? 1.0 : (0.7 + 0.3 * (slurryFlow - 100.0) / 100.0);
    if (slurryFlow < 100.0) slurryMultiplier = 0.7 * (slurryFlow / 100.0);
    
    let conditionerMultiplier = condSpeed >= 80.0 ? 1.0 : (0.9 + 0.1 * (condSpeed - 40.0) / 40.0);
    if (condSpeed < 40.0) conditionerMultiplier = 0.9 * (condSpeed / 40.0);
    
    let targetRR = (pressureFactor * platenSpeed * 10.0) * slurryMultiplier * conditionerMultiplier;
    if (t > 10) {
        targetRR += (slurryFlow * 0.25);
    }
    
    simulatedOutputs.rr += (targetRR - simulatedOutputs.rr) * 0.25;
    
    // 3. Uniformity model
    const uniformityBase = 98.3;
    const pressurePenalty = p > 3.5 ? (p - 3.5) * 2.33 : 0.0;
    const slurryPenalty = slurryFlow < 200.0 ? (200.0 - slurryFlow) * 0.038 : 0.0;
    const conditionerPenalty = condSpeed < 80.0 ? (80.0 - condSpeed) * 0.045 : 0.0;
    
    let targetUniformity = uniformityBase - pressurePenalty - slurryPenalty - conditionerPenalty;
    if (targetUniformity > 99.5) targetUniformity = 99.5;
    if (targetUniformity < 50.0) targetUniformity = 50.0;
    
    if (t <= 10) {
        simulatedOutputs.uniformity = 99.5 - (99.5 - targetUniformity) * (t / 10.0);
    } else {
        simulatedOutputs.uniformity += (targetUniformity - simulatedOutputs.uniformity) * 0.15;
    }
    
    return {
        carrierPressure: p,
        platenSpeed: platenSpeed,
        carrierSpeed: carrierSpeed,
        slurryFlow: slurryFlow,
        condPressure: condPressure,
        condSpeed: condSpeed
    };
}

// Evaluate Status based on Output values
function judgeParamStatus(val, min, max, type) {
    if (type === 'uniformity') {
        if (val < 95.0) return StatusLevel.DANGER;
        if (val >= 95.0 && val < 98.0) return StatusLevel.WARNING;
        return StatusLevel.NORMAL;
    } else if (type === 'temp') {
        if (val > 50.0) return StatusLevel.DANGER;
        if (val >= 45.0 && val <= 50.0) return StatusLevel.WARNING;
        return StatusLevel.NORMAL;
    } else if (type === 'rr') {
        if (val < 800.0 || val > 3200.0) return StatusLevel.DANGER;
        if ((val >= 800.0 && val < 1000.0) || (val > 3000.0 && val <= 3200.0)) return StatusLevel.WARNING;
        return StatusLevel.NORMAL;
    }
    return StatusLevel.NORMAL;
}

function judgeInputStatus(val, min, max) {
    const range = max - min;
    const lowerWarningBound = min + 0.15 * range;
    const upperWarningBound = max - 0.15 * range;
    
    if (val < (min - 0.1 * range) || val > (max + 0.1 * range)) {
        return StatusLevel.DANGER;
    } else if (val < min || val > max || val <= lowerWarningBound || val >= upperWarningBound) {
        return StatusLevel.WARNING;
    }
    return StatusLevel.NORMAL;
}

function evaluateOverallStatus(recipe, temp, rr, uniformity) {
    // 1. Evaluate outputs
    const sTemp = judgeParamStatus(temp, 25.0, 45.0, 'temp');
    const sRR = judgeParamStatus(rr, 1000.0, 3000.0, 'rr');
    const sUni = judgeParamStatus(uniformity, 98.0, 100.0, 'uniformity');
    
    // 2. Evaluate inputs
    let sInputs = StatusLevel.NORMAL;
    const checkInputs = [
        { v: recipe.carrierPressure, r: Ranges.carrierPressure },
        { v: recipe.platenSpeed, r: Ranges.platenSpeed },
        { v: recipe.carrierSpeed, r: Ranges.carrierSpeed },
        { v: recipe.slurryFlow, r: Ranges.slurryFlow },
        { v: recipe.condPressure, r: Ranges.condPressure },
        { v: recipe.condSpeed, r: Ranges.condSpeed }
    ];
    
    checkInputs.forEach(i => {
        const s = judgeInputStatus(i.v, i.r.min, i.r.max);
        if (s === StatusLevel.DANGER) sInputs = StatusLevel.DANGER;
        else if (s === StatusLevel.WARNING && sInputs !== StatusLevel.DANGER) sInputs = StatusLevel.WARNING;
    });
    
    // 3. Find max risk
    const ranks = { [StatusLevel.NORMAL]: 0, [StatusLevel.WARNING]: 1, [StatusLevel.DANGER]: 2 };
    
    let maxRank = Math.max(ranks[sTemp], ranks[sRR], ranks[sUni], ranks[sInputs]);
    
    if (maxRank === 2) return StatusLevel.DANGER;
    if (maxRank === 1) return StatusLevel.WARNING;
    return StatusLevel.NORMAL;
}

function getStatusDescription(status) {
    switch (status) {
        case StatusLevel.NORMAL:
            return "공정이 정상적으로 진행 중입니다.";
        case StatusLevel.WARNING:
            return "주의 상태입니다. 설비 점검이 필요할 수 있습니다.";
        case StatusLevel.DANGER:
            return "위험 상태입니다. 공정이 비정상 종료되었습니다.";
        default:
            return "";
    }
}

// --- Control Actions ---

// Validation for distribution percentages
function validateDistribution() {
    const pNormal = parseFloat(els.distNormal.value) || 0;
    const pSlurry = parseFloat(els.distSlurry.value) || 0;
    const pCond = parseFloat(els.distCond.value) || 0;
    const pPressure = parseFloat(els.distPressure.value) || 0;
    const totalWafers = parseInt(els.distTotalWafers.value) || 25;
    
    // Clamp totalWafers to [1, 10000] to prevent UI crash or slow execution
    if (totalWafers < 1) els.distTotalWafers.value = 1;
    if (totalWafers > 10000) els.distTotalWafers.value = 10000;
    
    els.summaryTotal.textContent = els.distTotalWafers.value;
    
    const sum = pNormal + pSlurry + pCond + pPressure;
    els.distTotalCount.textContent = sum.toFixed(0);
    
    if (Math.abs(sum - 100.0) < 0.01) {
        els.distValidationMsg.textContent = "✓ 비율 일치";
        els.distValidationMsg.className = "valid-msg";
        els.btnSimulate.disabled = false;
        return true;
    } else {
        els.distValidationMsg.textContent = `✗ 합계 100%여야 함 (${sum.toFixed(0)}%)`;
        els.distValidationMsg.className = "invalid-msg";
        els.btnSimulate.disabled = true;
        return false;
    }
}

// Apportions wafers based on percentages using the Largest Remainder Method
function calculateWaferCounts(pNormal, pSlurry, pCond, pPressure, totalWafers) {
    const percentages = [pNormal, pSlurry, pCond, pPressure];
    
    // 1. Calculate fractional counts
    const floatCounts = percentages.map(p => (p / 100) * totalWafers);
    
    // 2. Initial floor rounded counts
    const counts = floatCounts.map(f => Math.floor(f));
    let currentSum = counts.reduce((a, b) => a + b, 0);
    
    // 3. Calculate remainders
    const remainders = floatCounts.map((f, i) => ({
        index: i,
        rem: f - counts[i]
    }));
    
    // 4. Sort remainders in descending order
    remainders.sort((a, b) => b.rem - a.rem);
    
    // 5. Distribute remaining wafers
    let idx = 0;
    while (currentSum < totalWafers) {
        counts[remainders[idx].index]++;
        currentSum++;
        idx++;
    }
    
    return {
        normal: counts[0],
        slurry: counts[1],
        cond: counts[2],
        pressure: counts[3]
    };
}

// Simulates a wafer's full 60-second run instantly for large-batch optimization
function simulateWaferInstantly(recipe, scenarioIndex) {
    let temp = 25.0;
    let rr = 0.0;
    let uniformity = 99.5;
    
    let finalInputs = { ...recipe };
    
    for (let t = 1; t <= 60; t++) {
        let p = recipe.carrierPressure;
        let platenSpeed = recipe.platenSpeed;
        let carrierSpeed = recipe.carrierSpeed;
        let slurryFlow = recipe.slurryFlow;
        let condPressure = recipe.condPressure;
        let condSpeed = recipe.condSpeed;
        
        // Apply Scenario transitions
        if (scenarioIndex === 1) { // Slurry Warning (drops 220 -> 130 after 30s)
            if (t > 30) {
                const ratio = Math.min(1.0, (t - 30) / 20.0);
                slurryFlow = 220.0 - ratio * (220.0 - 130.0);
            }
        } else if (scenarioIndex === 2) { // Conditioner Warning (drops 80 -> 40 after 20s)
            if (t > 20) {
                const ratio = Math.min(1.0, (t - 20) / 30.0);
                condSpeed = 80.0 - ratio * (80.0 - 40.0);
            }
        } else if (scenarioIndex === 3) { // Carrier Pressure Danger (rises 3.5 -> 6.5 after 20s)
            if (t > 20) {
                const ratio = Math.min(1.0, (t - 20) / 20.0);
                p = 3.5 + ratio * (6.5 - 3.5);
            }
        }
        
        // Apply Startup Ramp-up (0-10 seconds)
        if (t <= 10) {
            const startupRatio = t / 10.0;
            p *= startupRatio;
            platenSpeed *= startupRatio;
            carrierSpeed *= startupRatio;
            slurryFlow *= startupRatio;
            condPressure *= startupRatio;
            condSpeed *= startupRatio;
        }
        
        finalInputs.carrierPressure = p;
        finalInputs.platenSpeed = platenSpeed;
        finalInputs.carrierSpeed = carrierSpeed;
        finalInputs.slurryFlow = slurryFlow;
        finalInputs.condPressure = condPressure;
        finalInputs.condSpeed = condSpeed;
        
        // 1. Temperature model
        let tempTarget = 24.4 + (p * 3.2) + (platenSpeed * 0.08) - (slurryFlow * 0.04);
        if (slurryFlow < 150.0 && t > 10) {
            tempTarget += (150.0 - slurryFlow) * 0.08;
        }
        
        let targetTemp = t <= 10 
            ? 25.0 + (tempTarget - 25.0) * (t / 10.0)
            : tempTarget;
        
        temp += (targetTemp - temp) * 0.2;
        
        // 2. Removal Rate model
        const pressureFactor = p <= 4.0 ? p : (4.0 + (p - 4.0) * 0.35);
        
        let slurryMultiplier = slurryFlow >= 200.0 ? 1.0 : (0.7 + 0.3 * (slurryFlow - 100.0) / 100.0);
        if (slurryFlow < 100.0) slurryMultiplier = 0.7 * (slurryFlow / 100.0);
        
        let conditionerMultiplier = condSpeed >= 80.0 ? 1.0 : (0.9 + 0.1 * (condSpeed - 40.0) / 40.0);
        if (condSpeed < 40.0) conditionerMultiplier = 0.9 * (condSpeed / 40.0);
        
        let targetRR = (pressureFactor * platenSpeed * 10.0) * slurryMultiplier * conditionerMultiplier;
        if (t > 10) {
            targetRR += (slurryFlow * 0.25);
        }
        
        rr += (targetRR - rr) * 0.25;
        
        // 3. Uniformity model
        const uniformityBase = 98.3;
        const pressurePenalty = p > 3.5 ? (p - 3.5) * 2.33 : 0.0;
        const slurryPenalty = slurryFlow < 200.0 ? (200.0 - slurryFlow) * 0.038 : 0.0;
        const conditionerPenalty = condSpeed < 80.0 ? (80.0 - condSpeed) * 0.045 : 0.0;
        
        let targetUniformity = uniformityBase - pressurePenalty - slurryPenalty - conditionerPenalty;
        if (targetUniformity > 99.5) targetUniformity = 99.5;
        if (targetUniformity < 50.0) targetUniformity = 50.0;
        
        if (t <= 10) {
            uniformity = 99.5 - (99.5 - targetUniformity) * (t / 10.0);
        } else {
            uniformity += (targetUniformity - uniformity) * 0.15;
        }
    }
    
    return {
        temp: temp,
        rr: rr,
        uniformity: uniformity,
        finalInputs: finalInputs
    };
}

// Distribution input listeners
[els.distTotalWafers, els.distNormal, els.distSlurry, els.distCond, els.distPressure].forEach(input => {
    if (input) {
        input.addEventListener('input', validateDistribution);
        input.addEventListener('change', validateDistribution);
    }
});

// Range Info Modal Open / Close
els.btnRangeInfo.addEventListener('click', () => {
    els.rangeModal.classList.add('active');
});

const closeModal = () => {
    els.rangeModal.classList.remove('active');
};
els.btnCloseModal.addEventListener('click', closeModal);
els.btnCloseModalBtn.addEventListener('click', closeModal);
// Simulate Button click (Start / Stop)
els.btnSimulate.addEventListener('click', () => {
    if (isSimulating) {
        stopSimulation(true); // Premature stop
    } else {
        startSimulation();
    }
});

function startSimulation() {
    if (!validateDistribution()) return; // check sum equals 25
    
    // Read and structure baseline recipe
    simulatedRecipe = {
        carrierPressure: parseFloat(els.carrierPressure.value),
        platenSpeed: parseInt(els.platenSpeed.value),
        carrierSpeed: parseInt(els.carrierSpeed.value),
        slurryFlow: parseInt(els.slurryFlow.value),
        condPressure: parseFloat(els.condPressure.value),
        condSpeed: parseInt(els.condSpeed.value),
        polishTime: parseInt(els.polishTime.value)
    };
    
    // Generate the Wafers Batch based on Scenario Distribution Percentages
    const pNormal = parseFloat(els.distNormal.value) || 0;
    const pSlurry = parseFloat(els.distSlurry.value) || 0;
    const pCond = parseFloat(els.distCond.value) || 0;
    const pPressure = parseFloat(els.distPressure.value) || 0;
    const totalWafers = parseInt(els.distTotalWafers.value) || 25;
    
    const counts = calculateWaferCounts(pNormal, pSlurry, pCond, pPressure, totalWafers);
    
    let scenariosPool = [];
    for (let i = 0; i < counts.normal; i++) scenariosPool.push(0);
    for (let i = 0; i < counts.slurry; i++) scenariosPool.push(1);
    for (let i = 0; i < counts.cond; i++) scenariosPool.push(2);
    for (let i = 0; i < counts.pressure; i++) scenariosPool.push(3);
    
    // Shuffle to randomize order
    for (let i = scenariosPool.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [scenariosPool[i], scenariosPool[j]] = [scenariosPool[j], scenariosPool[i]];
    }
    
    waferBatch = [];
    for (let i = 0; i < totalWafers; i++) {
        waferBatch.push({
            waferNo: i + 1,
            scenarioIndex: scenariosPool[i]
        });
    }
    
    // Reset simulation batch variables
    isSimulating = true;
    currentWaferIdx = 0;
    currentTime = 0;
    totalTime = simulatedRecipe.polishTime;
    simulatedOutputs = {
        temp: 25.0,
        rr: 0.0,
        uniformity: 99.5
    };
    
    goodCount = 0;
    badCount = 0;
    yieldPct = 0.0;
    
    chartData = [];
    drawChart();
    
    logHistory = [];
    renderLogTable();
    
    // UI states
    setInputsDisabled(true);
    els.btnSimulate.innerHTML = '<span class="btn-icon">■</span> 공정 정지 (Stop)';
    els.btnSimulate.className = 'btn btn-danger btn-large';
    
    els.progressLabel.textContent = `Wafer #1 / ${totalWafers} 시작...`;
    els.progressLabel.style.color = 'var(--color-warning)';
    els.progressBarFill.style.width = '0%';
    els.summaryTotal.textContent = totalWafers;
    els.summaryGood.textContent = '0';
    els.summaryBad.textContent = '0';
    els.summaryYield.textContent = '0.0%';
    els.summaryYield.className = 'stat-val text-glow';
    
    targetGaugeValue = 99.5;
    currentGaugeValue = 99.5;
    
    // Trigger gauge animation loop
    initGaugeAnimation();
    
    // Start simulation loop
    if (totalWafers <= 50) {
        // Slow real-time sequential simulation mode (10ms per simulated second)
        simulationInterval = setInterval(() => {
            currentTime++;
            
            const activeScenario = waferBatch[currentWaferIdx].scenarioIndex;
            
            // Perform simulation step
            const currentInputs = simulateStep(currentTime, simulatedRecipe, activeScenario);
            
            // Update input readouts in UI dynamically to show the changing wafer state
            updateNumericInputSilently(els.slurryFlow, currentInputs.slurryFlow);
            updateNumericInputSilently(els.condSpeed, currentInputs.condSpeed);
            updateNumericInputSilently(els.carrierPressure, currentInputs.carrierPressure);
            
            // Update output readouts in UI
            els.resTemp.textContent = simulatedOutputs.temp.toFixed(1);
            els.resRR.textContent = Math.round(simulatedOutputs.rr).toLocaleString();
            targetGaugeValue = simulatedOutputs.uniformity;
            
            // Overall progress (percent of totalWafers * 60 seconds)
            const overallTime = currentWaferIdx * 60 + currentTime;
            const progressPct = (overallTime / (totalWafers * 60)) * 100;
            els.progressBarFill.style.width = `${progressPct}%`;
            els.progressLabel.textContent = `진행 중: Wafer #${currentWaferIdx + 1} / ${totalWafers} (${currentTime}초)`;
            
            // If current wafer finishes (60 seconds)
            if (currentTime >= 60) {
                // 1. Evaluate wafer status
                const waferStatus = evaluateOverallStatus(
                    simulatedRecipe,
                    simulatedOutputs.temp,
                    simulatedOutputs.rr,
                    simulatedOutputs.uniformity
                );
                
                // 2. Increment counters
                if (waferStatus === StatusLevel.NORMAL) {
                    goodCount++;
                } else {
                    badCount++;
                }
                yieldPct = (goodCount / (currentWaferIdx + 1)) * 100;
                
                // 3. Update summary card UI
                els.summaryGood.textContent = goodCount;
                els.summaryBad.textContent = badCount;
                els.summaryYield.textContent = `${yieldPct.toFixed(1)}%`;
                
                // If yield is low, color red, else green
                if (yieldPct < 80) {
                    els.summaryYield.className = 'stat-val text-red text-glow';
                } else {
                    els.summaryYield.className = 'stat-val text-green text-glow';
                }
                
                // 4. Append to trend chart data (wafer trend)
                chartData.push({
                    t: currentWaferIdx + 1,
                    temp: simulatedOutputs.temp,
                    rr: simulatedOutputs.rr,
                    uniformity: simulatedOutputs.uniformity
                });
                drawChart();
                
                // 5. Append to log table (one row per Wafer No.)
                addLogEntry(currentWaferIdx + 1, simulatedRecipe, simulatedOutputs, waferStatus);
                renderLogTable(); // Explicitly render table on wafer completion
                
                // 6. Transition to next wafer or finish FOUP
                if (currentWaferIdx < totalWafers - 1) {
                    currentWaferIdx++;
                    currentTime = 0;
                    // Keep the outputs initialized at baseline for next wafer startup
                    simulatedOutputs = {
                        temp: 25.0,
                        rr: 0.0,
                        uniformity: 99.5
                    };
                    
                    // Reset inputs UI back to baseline recipe values for next wafer start
                    updateNumericInputSilently(els.slurryFlow, simulatedRecipe.slurryFlow);
                    updateNumericInputSilently(els.condSpeed, simulatedRecipe.condSpeed);
                    updateNumericInputSilently(els.carrierPressure, simulatedRecipe.carrierPressure);
                } else {
                    // FOUP Completed!
                    stopSimulation(false);
                }
            }
        }, 10);
    } else {
        // High-speed chunked simulation mode for large batches (up to 10,000)
        // We complete the batch in ~2 seconds (200 ticks of 10ms)
        const wafersPerTick = Math.ceil(totalWafers / 200);
        let lastUiUpdateTime = 0;
        
        simulationInterval = setInterval(() => {
            let lastOutput = null;
            let lastInputs = null;
            let lastStatus = null;
            
            for (let k = 0; k < wafersPerTick; k++) {
                if (currentWaferIdx >= totalWafers) break;
                
                const activeScenario = waferBatch[currentWaferIdx].scenarioIndex;
                const result = simulateWaferInstantly(simulatedRecipe, activeScenario);
                
                lastOutput = {
                    temp: result.temp,
                    rr: result.rr,
                    uniformity: result.uniformity
                };
                lastInputs = result.finalInputs;
                
                lastStatus = evaluateOverallStatus(
                    lastInputs,
                    result.temp,
                    result.rr,
                    result.uniformity
                );
                
                if (lastStatus === StatusLevel.NORMAL) {
                    goodCount++;
                } else {
                    badCount++;
                }
                
                chartData.push({
                    t: currentWaferIdx + 1,
                    temp: result.temp,
                    rr: result.rr,
                    uniformity: result.uniformity
                });
                
                addLogEntry(currentWaferIdx + 1, lastInputs, lastOutput, lastStatus);
                currentWaferIdx++;
            }
            
            // Throttled UI rendering (every 80ms) for high performance and smooth animation
            const now = Date.now();
            if (now - lastUiUpdateTime > 80 || currentWaferIdx >= totalWafers) {
                lastUiUpdateTime = now;
                
                if (lastOutput) {
                    els.resTemp.textContent = lastOutput.temp.toFixed(1);
                    els.resRR.textContent = Math.round(lastOutput.rr).toLocaleString();
                    targetGaugeValue = lastOutput.uniformity;
                    
                    updateNumericInputSilently(els.slurryFlow, lastInputs.slurryFlow);
                    updateNumericInputSilently(els.condSpeed, lastInputs.condSpeed);
                    updateNumericInputSilently(els.carrierPressure, lastInputs.carrierPressure);
                }
                
                yieldPct = (goodCount / currentWaferIdx) * 100;
                els.summaryGood.textContent = goodCount;
                els.summaryBad.textContent = badCount;
                els.summaryYield.textContent = `${yieldPct.toFixed(1)}%`;
                
                if (yieldPct < 80) {
                    els.summaryYield.className = 'stat-val text-red text-glow';
                } else {
                    els.summaryYield.className = 'stat-val text-green text-glow';
                }
                
                drawChart();
                renderLogTable(); // Render table only in throttled UI frames
                
                const progressPct = (currentWaferIdx / totalWafers) * 100;
                els.progressBarFill.style.width = `${progressPct}%`;
                els.progressLabel.textContent = `진행 중: Wafer #${currentWaferIdx} / ${totalWafers}`;
            }
            
            if (currentWaferIdx >= totalWafers) {
                stopSimulation(false);
            }
        }, 10);
    }
}

function updateNumericInputSilently(inputEl, val) {
    // Keep it clamped and formatted
    const min = parseFloat(inputEl.min);
    const max = parseFloat(inputEl.max);
    let clamped = Math.max(min, Math.min(max, val));
    if (inputEl.step === "0.1") {
        inputEl.value = clamped.toFixed(1);
    } else {
        inputEl.value = Math.round(clamped);
    }
}

function stopSimulation(aborted) {
    clearInterval(simulationInterval);
    isSimulating = false;
    
    // Reset controls
    setInputsDisabled(false);
    els.btnSimulate.innerHTML = '<span class="btn-icon">▶</span> 시뮬레이션 실행 (Simulate)';
    els.btnSimulate.className = 'btn btn-primary btn-large';
    
    if (aborted) {
        els.progressLabel.textContent = "공정 비정상 중지";
        els.progressLabel.style.color = 'var(--color-danger)';
        els.progressBarFill.style.width = '0%';
        
        // Update Status Badge to Danger
        updateStatusDisplay(StatusLevel.DANGER, "사용자에 의해 공정이 중도 정지되었습니다.");
        
        if (logHistory.length > 0) {
            logHistory[logHistory.length - 1].status = StatusLevel.DANGER;
            renderLogTable();
        }
    } else {
        // Normal completion
        els.progressLabel.textContent = "공정 완료";
        els.progressLabel.style.color = 'var(--color-normal)';
        els.progressBarFill.style.width = '100%';
        
        // Determine overall status based on yield
        let finalStatus = StatusLevel.NORMAL;
        let explanation = "";
        const totalWafers = waferBatch.length;
        
        if (yieldPct >= 92.0) {
            finalStatus = StatusLevel.NORMAL;
            explanation = `FOUP 공정이 성공적으로 완료되었습니다. (양품: ${goodCount} / ${totalWafers}, 양품 비율: ${yieldPct.toFixed(1)}%)`;
        } else if (yieldPct >= 80.0) {
            finalStatus = StatusLevel.WARNING;
            explanation = `주의: 일부 웨이퍼가 불합격되었습니다. (양품: ${goodCount} / ${totalWafers}, 양품 비율: ${yieldPct.toFixed(1)}%)`;
        } else {
            finalStatus = StatusLevel.DANGER;
            explanation = `위험: 양품 비율이 너무 낮습니다. 설비 점검이 필요합니다. (양품: ${goodCount} / ${totalWafers}, 양품 비율: ${yieldPct.toFixed(1)}%)`;
        }
        
        updateStatusDisplay(finalStatus, explanation);
    }
}

function updateStatusDisplay(status, explanation) {
    // Reset status badge classes
    els.statusBadge.className = 'status-badge';
    
    const badgeText = els.statusBadge.querySelector('.badge-text');
    const badgeIcon = els.statusBadge.querySelector('.badge-icon');
    
    badgeText.textContent = status;
    els.statusExplanation.textContent = explanation;
    
    switch (status) {
        case StatusLevel.NORMAL:
            els.statusBadge.classList.add('normal');
            badgeIcon.textContent = '✅';
            break;
        case StatusLevel.WARNING:
            els.statusBadge.classList.add('warning');
            badgeIcon.textContent = '⚠️';
            break;
        case StatusLevel.DANGER:
            els.statusBadge.classList.add('danger');
            badgeIcon.textContent = '🚨';
            break;
        case StatusLevel.READY:
            els.statusBadge.classList.add('ready');
            badgeIcon.textContent = '⏳';
            break;
    }
}

function setInputsDisabled(disabled) {
    els.carrierPressure.disabled = disabled;
    els.platenSpeed.disabled = disabled;
    els.carrierSpeed.disabled = disabled;
    els.slurryFlow.disabled = disabled;
    els.condPressure.disabled = disabled;
    els.condSpeed.disabled = disabled;
    els.polishTime.disabled = disabled;
    
    els.distNormal.disabled = disabled;
    els.distSlurry.disabled = disabled;
    els.distCond.disabled = disabled;
    els.distPressure.disabled = disabled;
    
    els.btnReset.disabled = disabled;
    els.btnSaveLog.disabled = disabled;
    els.btnRangeInfo.disabled = disabled;
}

// Log table and history additions
function addLogEntry(waferNo, recipe, outputs, status) {
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const timeStr = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
    
    const entry = {
        id: `Wafer #${waferNo}`,
        recipeId: 'RCP-001',
        time: timeStr,
        pressure: typeof recipe.carrierPressure === 'number' ? recipe.carrierPressure.toFixed(1) : parseFloat(recipe.carrierPressure).toFixed(1),
        platen: Math.round(recipe.platenSpeed),
        carrier: Math.round(recipe.carrierSpeed),
        slurry: Math.round(recipe.slurryFlow),
        condP: typeof recipe.condPressure === 'number' ? recipe.condPressure.toFixed(1) : parseFloat(recipe.condPressure).toFixed(1),
        condS: Math.round(recipe.condSpeed),
        timeSec: recipe.polishTime,
        temp: outputs.temp.toFixed(1),
        rr: Math.round(outputs.rr),
        uniformity: outputs.uniformity.toFixed(1),
        status: status
    };
    
    logHistory.push(entry);
}

function renderLogTable() {
    els.logTableBody.innerHTML = '';
    
    // Sort in reverse order (newest first)
    const reversed = [...logHistory].reverse();
    const maxToRender = Math.min(reversed.length, 100);
    
    for (let i = 0; i < maxToRender; i++) {
        const e = reversed[i];
        const tr = document.createElement('tr');
        
        let statusClass = 'normal-text';
        if (e.status === StatusLevel.WARNING) statusClass = 'warning-text';
        if (e.status === StatusLevel.DANGER) statusClass = 'danger-text';
        
        tr.innerHTML = `
            <td>${e.id}</td>
            <td>${e.time}</td>
            <td>${e.pressure}</td>
            <td>${e.platen}</td>
            <td>${e.carrier}</td>
            <td>${e.slurry}</td>
            <td>${e.condP}</td>
            <td>${e.condS}</td>
            <td>${e.timeSec}</td>
            <td>${e.temp}</td>
            <td>${e.rr.toLocaleString()}</td>
            <td>${e.uniformity}</td>
            <td class="log-status-cell ${statusClass}">${e.status}</td>
        `;
        els.logTableBody.appendChild(tr);
    }
    
    // If there are more logs, add a row indicating truncation
    if (logHistory.length > 100) {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td colspan="13" style="text-align: center; color: var(--text-muted); font-size: 11px; padding: 10px; background-color: rgba(0, 0, 0, 0.15);">
                ※ 최신 100개의 로그만 표시 중입니다. (전체 ${logHistory.length}개 로그는 파일 저장 시 모두 포함됩니다.)
            </td>
        `;
        els.logTableBody.appendChild(tr);
    }
}

// Save Log to CSV
els.btnSaveLog.addEventListener('click', () => {
    if (logHistory.length === 0) {
        alert('저장할 시뮬레이션 로그가 없습니다.');
        return;
    }
    
    // Create CSV content
    const headers = 'WaferNo,RecipeID,Time,CarrierPressure(psi),PlatenSpeed(rpm),CarrierSpeed(rpm),SlurryFlowRate(mL/min),ConditionerPressure(psi),ConditionerSpeed(rpm),PolishTime(sec),Temperature(C),RemovalRate(A/min),Uniformity(%),Status\n';
    
    const rows = logHistory.map(e => {
        return `${e.id},${e.recipeId},${e.time},${e.pressure},${e.platen},${e.carrier},${e.slurry},${e.condP},${e.condS},${e.timeSec},${e.temp},${e.rr},${e.uniformity},${e.status}`;
    }).join('\n');
    
    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + encodeURIComponent(headers + rows);
    
    // Create filename based on current simulation run date/time
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const dateStr = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
    const timeStr = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
    const filename = `cmp_log_${dateStr}_${timeStr}.csv`;
    
    // Create hidden download link and click it
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', csvContent);
    downloadAnchor.setAttribute('download', filename);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    document.body.removeChild(downloadAnchor);
});

// Reset Button click
els.btnReset.addEventListener('click', () => {
    resetUI();
});

function resetUI() {
    // Inputs reset
    els.carrierPressure.value = 3.5;
    els.platenSpeed.value = 60;
    els.carrierSpeed.value = 60;
    els.slurryFlow.value = 200;
    els.condPressure.value = 3.0;
    els.condSpeed.value = 80;
    els.polishTime.value = 60;
    
    // Distribution inputs reset
    els.distTotalWafers.value = 25;
    els.distNormal.value = 80;
    els.distSlurry.value = 8;
    els.distCond.value = 8;
    els.distPressure.value = 4;
    validateDistribution();
    
    // Outputs reset
    els.resTemp.textContent = '25.0';
    els.resRR.textContent = '0';
    
    targetGaugeValue = 98.3;
    currentGaugeValue = 98.3;
    drawGauge(98.3);
    
    chartData = [];
    drawChart();
    
    // Yield summary reset
    els.summaryTotal.textContent = '25';
    els.summaryGood.textContent = '0';
    els.summaryBad.textContent = '0';
    els.summaryYield.textContent = '0.0%';
    
    logHistory = [];
    nextLogId = 1;
    renderLogTable();
    
    // Status Display Reset
    updateStatusDisplay(StatusLevel.READY, "공정 대기 중입니다. 공정 조건을 설정한 후 시작 버튼을 누르세요.");
    
    els.progressLabel.textContent = "대기 중";
    els.progressLabel.style.color = 'var(--text-muted)';
    els.progressBarFill.style.width = '0%';
    
    setInputsDisabled(false);
}

// Initial draw on page load
resetUI();

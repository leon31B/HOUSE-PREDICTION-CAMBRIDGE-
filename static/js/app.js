/**
 * California Housing ML GUI - Frontend Application Logic
 * Integrates Leaflet Maps, Real-time Validation, Presets, and Flask Inference API
 */

// Determine API base URL (works seamlessly both on http://localhost:5000 and direct file hosting)
const API_BASE = window.location.protocol.startsWith('http') 
    ? window.location.origin 
    : 'http://localhost:5000';

// Preset configurations
const PRESETS = {
    bay_area: {
        name: "SF Bay Area Villa (Notebook Cell 50)",
        longitude: -122.230,
        latitude: 37.880,
        housing_median_age: 41,
        total_rooms: 880,
        total_bedrooms: 129,
        population: 322,
        households: 126,
        median_income: 8.32,
        ocean_proximity: "NEAR BAY"
    },
    santa_monica: {
        name: "Santa Monica Beachfront",
        longitude: -118.491,
        latitude: 34.019,
        housing_median_age: 32,
        total_rooms: 2850,
        total_bedrooms: 520,
        population: 1180,
        households: 495,
        median_income: 9.85,
        ocean_proximity: "NEAR OCEAN"
    },
    san_diego: {
        name: "San Diego Coastal Suburban",
        longitude: -117.161,
        latitude: 32.715,
        housing_median_age: 24,
        total_rooms: 2450,
        total_bedrooms: 440,
        population: 1350,
        households: 430,
        median_income: 6.40,
        ocean_proximity: "<1H OCEAN"
    },
    sacramento: {
        name: "Sacramento Suburban Neighborhood",
        longitude: -121.494,
        latitude: 38.581,
        housing_median_age: 18,
        total_rooms: 3200,
        total_bedrooms: 590,
        population: 1720,
        households: 560,
        median_income: 4.15,
        ocean_proximity: "INLAND"
    },
    fresno: {
        name: "Central Valley Inland Family Home",
        longitude: -119.772,
        latitude: 36.746,
        housing_median_age: 28,
        total_rooms: 1850,
        total_bedrooms: 390,
        population: 1200,
        households: 370,
        median_income: 2.45,
        ocean_proximity: "INLAND"
    }
};

// State
let map = null;
let mapMarker = null;
let currentPrediction = 443311;
let isPredicting = false;

// DOM Elements
const form = document.getElementById('prediction-form');
const btnPredict = document.getElementById('btn-predict');
const btnReset = document.getElementById('btn-reset');
const btnSpinner = document.getElementById('btn-spinner');
const btnNotebookSample = document.getElementById('btn-load-notebook-sample');
const statusLabel = document.getElementById('status-label');
const statusDot = document.querySelector('.status-dot');
const priceDisplay = document.getElementById('price-display');
const marketTierBadge = document.getElementById('market-tier-badge');
const benchmarkBar = document.getElementById('benchmark-bar');
const benchmarkPct = document.getElementById('benchmark-pct');
const insightPrimary = document.getElementById('insight-primary');
const insightLocation = document.getElementById('insight-location');
const insightLatency = document.getElementById('insight-latency');

// Slider Elements
const incomeSlider = document.getElementById('median_income_slider');
const incomeInput = document.getElementById('median_income');
const incomeVal = document.getElementById('median-income-val');
const incomeSalary = document.getElementById('median-income-salary');

const ageSlider = document.getElementById('housing_median_age_slider');
const ageInput = document.getElementById('housing_median_age');
const ageVal = document.getElementById('housing-age-val');

const lonInput = document.getElementById('longitude');
const latInput = document.getElementById('latitude');
const roomsInput = document.getElementById('total_rooms');
const bedroomsInput = document.getElementById('total_bedrooms');
const popInput = document.getElementById('population');
const householdsInput = document.getElementById('households');

// Derived Stats Elements
const statRph = document.getElementById('stat-rph');
const statBpr = document.getElementById('stat-bpr');
const statPph = document.getElementById('stat-pph');

// Initialize application
document.addEventListener('DOMContentLoaded', () => {
    initMap();
    initSliders();
    initDerivedMetricsListeners();
    initPresets();
    checkBackendHealth();

    form.addEventListener('submit', handleFormSubmit);
    btnReset.addEventListener('click', () => loadPreset('bay_area'));
    btnNotebookSample.addEventListener('click', () => loadPreset('bay_area', true));
});

/**
 * Initialize Leaflet Map centered on California
 */
function initMap() {
    const defaultLat = parseFloat(latInput.value) || 37.88;
    const defaultLng = parseFloat(lonInput.value) || -122.23;

    map = L.map('ca-map', {
        center: [defaultLat, defaultLng],
        zoom: 7,
        zoomControl: true,
        attributionControl: false
    });

    // Esri Light Gray Canvas tile layer (clean white/light theme without API key watermark)
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}', {
        maxZoom: 16,
        attribution: 'Esri, HERE, Garmin, © OpenStreetMap contributors'
    }).addTo(map);

    // Custom marker icon using Neo-Brutalist styling
    const customIcon = L.divIcon({
        className: 'custom-map-pin',
        html: `<div style="
            width: 20px; 
            height: 20px; 
            background: #7B9669; 
            border: 3px solid #2B3726; 
            box-shadow: 3px 3px 0px #2B3726;
            transform: translate(-50%, -50%);
        "></div>`,
        iconSize: [22, 22],
        iconAnchor: [11, 11]
    });

    mapMarker = L.marker([defaultLat, defaultLng], {
        draggable: true,
        icon: customIcon
    }).addTo(map);

    // Map click handler
    map.on('click', (e) => {
        updateCoordinates(e.latlng.lat, e.latlng.lng);
    });

    // Marker drag handler
    mapMarker.on('dragend', () => {
        const pos = mapMarker.getLatLng();
        updateCoordinates(pos.lat, pos.lng);
    });

    // Input change handlers
    latInput.addEventListener('input', () => syncMarkerFromInputs());
    lonInput.addEventListener('input', () => syncMarkerFromInputs());
}

function updateCoordinates(lat, lng) {
    const roundedLat = parseFloat(lat.toFixed(3));
    const roundedLng = parseFloat(lng.toFixed(3));
    
    latInput.value = roundedLat;
    lonInput.value = roundedLng;
    mapMarker.setLatLng([roundedLat, roundedLng]);
    map.panTo([roundedLat, roundedLng]);

    // Smart heuristic for ocean proximity suggestion
    suggestOceanProximity(roundedLat, roundedLng);
    updateDerivedMetrics();
}

function syncMarkerFromInputs() {
    const lat = parseFloat(latInput.value);
    const lng = parseFloat(lonInput.value);
    if (!isNaN(lat) && !isNaN(lng)) {
        mapMarker.setLatLng([lat, lng]);
        map.panTo([lat, lng]);
        suggestOceanProximity(lat, lng);
    }
}

/**
 * Intelligent helper to auto-select probable ocean proximity based on coordinates
 */
function suggestOceanProximity(lat, lng) {
    let proximity = null;
    if (lng > -120.5 && lat > 34.5) {
        proximity = "INLAND";
    } else if (lat >= 37.4 && lat <= 38.1 && lng >= -122.6 && lng <= -122.1) {
        proximity = "NEAR BAY";
    } else if (lng <= -121.8 || (lat <= 34.5 && lng <= -118.4)) {
        proximity = "NEAR OCEAN";
    } else {
        proximity = "<1H OCEAN";
    }

    if (proximity) {
        const radio = document.querySelector(`input[name="ocean_proximity"][value="${proximity}"]`);
        if (radio && !radio.checked) {
            radio.checked = true;
        }
    }
}

/**
 * Sliders and Live Values Binding
 */
function initSliders() {
    // Income slider
    incomeSlider.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        incomeInput.value = val.toFixed(2);
        incomeVal.textContent = val.toFixed(2);
        incomeSalary.textContent = `($${(val * 10000).toLocaleString()} / yr)`;
        updateDerivedMetrics();
    });

    // Age slider
    ageSlider.addEventListener('input', (e) => {
        const val = parseInt(e.target.value);
        ageInput.value = val;
        ageVal.textContent = val;
        updateDerivedMetrics();
    });
}

/**
 * Listeners for live derived metrics calculations
 */
function initDerivedMetricsListeners() {
    [roomsInput, bedroomsInput, popInput, householdsInput].forEach(input => {
        input.addEventListener('input', updateDerivedMetrics);
    });
    updateDerivedMetrics();
}

function updateDerivedMetrics() {
    const rooms = parseFloat(roomsInput.value) || 0;
    const bedrooms = parseFloat(bedroomsInput.value) || 0;
    const pop = parseFloat(popInput.value) || 0;
    const households = parseFloat(householdsInput.value) || 0;

    const rph = households > 0 ? (rooms / households).toFixed(2) : '0.00';
    const bpr = rooms > 0 ? (bedrooms / rooms).toFixed(3) : '0.000';
    const pph = households > 0 ? (pop / households).toFixed(2) : '0.00';

    statRph.textContent = rph;
    statBpr.textContent = bpr;
    statPph.textContent = pph;
}

/**
 * Presets Management
 */
function initPresets() {
    const presetBtns = document.querySelectorAll('.preset-btn');
    presetBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            presetBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const key = btn.dataset.preset;
            loadPreset(key, true);
        });
    });
}

function loadPreset(key, autoPredict = false) {
    const p = PRESETS[key];
    if (!p) return;

    lonInput.value = p.longitude;
    latInput.value = p.latitude;
    if (mapMarker && map) {
        mapMarker.setLatLng([p.latitude, p.longitude]);
        map.setView([p.latitude, p.longitude], 8);
    }

    // Income
    incomeSlider.value = p.median_income;
    incomeInput.value = p.median_income;
    incomeVal.textContent = p.median_income.toFixed(2);
    incomeSalary.textContent = `($${(p.median_income * 10000).toLocaleString()} / yr)`;

    // Age
    ageSlider.value = p.housing_median_age;
    ageInput.value = p.housing_median_age;
    ageVal.textContent = p.housing_median_age;

    // Numerical
    roomsInput.value = p.total_rooms;
    bedroomsInput.value = p.total_bedrooms;
    popInput.value = p.population;
    householdsInput.value = p.households;

    // Proximity
    const radio = document.querySelector(`input[name="ocean_proximity"][value="${p.ocean_proximity}"]`);
    if (radio) radio.checked = true;

    updateDerivedMetrics();

    if (autoPredict) {
        requestPrediction();
    }
}

/**
 * Check backend ML engine connectivity
 */
async function checkBackendHealth() {
    try {
        const res = await fetch(`${API_BASE}/api/info`);
        if (res.ok) {
            const data = await res.json();
            statusLabel.textContent = `Online: ${data.model_name}`;
            statusDot.style.backgroundColor = '#7B9669';
            statusDot.style.boxShadow = '0 0 10px #7B9669';
        } else {
            setOfflineStatus();
        }
    } catch (err) {
        setOfflineStatus();
    }
}

function setOfflineStatus() {
    statusLabel.textContent = 'Backend Offline (Start app.py)';
    statusDot.style.backgroundColor = '#f59e0b';
    statusDot.style.boxShadow = '0 0 10px #f59e0b';
}

/**
 * Form Submit & Prediction Call
 */
function handleFormSubmit(e) {
    e.preventDefault();
    requestPrediction();
}

async function requestPrediction() {
    if (isPredicting) return;
    isPredicting = true;

    btnSpinner.style.display = 'inline-block';
    btnPredict.disabled = true;

    const startTime = performance.now();

    const selectedProximity = document.querySelector('input[name="ocean_proximity"]:checked')?.value || 'NEAR BAY';

    const payload = {
        longitude: parseFloat(lonInput.value),
        latitude: parseFloat(latInput.value),
        housing_median_age: parseFloat(ageInput.value),
        total_rooms: parseFloat(roomsInput.value),
        total_bedrooms: bedroomsInput.value !== "" ? parseFloat(bedroomsInput.value) : null,
        population: parseFloat(popInput.value),
        households: parseFloat(householdsInput.value),
        median_income: parseFloat(incomeInput.value),
        ocean_proximity: selectedProximity
    };

    try {
        const response = await fetch(`${API_BASE}/api/predict`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        const data = await response.json();
        const latency = Math.round(performance.now() - startTime);

        if (response.ok && data.success) {
            updateResultUI(data, latency, payload);
        } else {
            alert(`Prediction error: ${data.error || 'Server error'}`);
        }
    } catch (error) {
        console.error("API error:", error);
        alert(`Cannot reach ML backend at ${API_BASE}. Please ensure 'python app.py' is running.`);
    } finally {
        isPredicting = false;
        btnSpinner.style.display = 'none';
        btnPredict.disabled = false;
    }
}

/**
 * Smooth UI Update with Number Animation and Metric Badges
 */
function updateResultUI(data, latency, payload) {
    const targetPrice = Math.round(data.prediction);

    // Animate number count-up
    animatePrice(currentPrediction, targetPrice, 500);
    currentPrediction = targetPrice;

    // Market Tier Badge
    marketTierBadge.textContent = data.market_tier;
    marketTierBadge.className = `market-pill ${data.market_tier_class}`;

    // Benchmark comparison bar
    const caMedian = 179700;
    const diffPct = data.comparison_to_ca_median_pct;
    if (diffPct >= 0) {
        benchmarkPct.textContent = `+${diffPct}% Above`;
        benchmarkPct.className = 'benchmark-diff positive';
    } else {
        benchmarkPct.textContent = `${diffPct}% Below`;
        benchmarkPct.className = 'benchmark-diff negative';
    }

    // Benchmark bar width (scale: $15,000 to $500,000)
    const normalizedWidth = Math.min(100, Math.max(5, ((targetPrice - 15000) / (500000 - 15000)) * 100));
    benchmarkBar.style.width = `${normalizedWidth}%`;

    // Dynamic Insights
    if (payload.median_income >= 7) {
        insightPrimary.textContent = `High Income Tier ($${Math.round(payload.median_income * 10)}k)`;
    } else if (payload.median_income <= 2.5) {
        insightPrimary.textContent = `Low Income Factor ($${Math.round(payload.median_income * 10)}k)`;
    } else {
        insightPrimary.textContent = `Moderate Income ($${Math.round(payload.median_income * 10)}k)`;
    }

    insightLocation.textContent = `${payload.ocean_proximity} Area`;
    insightLatency.textContent = `~${latency} ms`;
}

/**
 * Animated Price Counter
 */
function animatePrice(start, end, duration) {
    const startTime = performance.now();
    function update(now) {
        const elapsed = now - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const easeOutQuad = 1 - (1 - progress) * (1 - progress);
        const current = Math.floor(start + (end - start) * easeOutQuad);
        priceDisplay.textContent = current.toLocaleString();

        if (progress < 1) {
            requestAnimationFrame(update);
        } else {
            priceDisplay.textContent = end.toLocaleString();
        }
    }
    requestAnimationFrame(update);
}

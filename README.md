# California Housing Price Prediction - ML GUI

A high-performance, modern GUI application to predict California median house values in real time, powered by the machine learning pipeline developed in [`house_predict_model.ipynb`](./house_predict_model.ipynb).

---

## 🚀 Features

- **Tuned ML Pipeline**: Utilizes the Scikit-Learn `HistGradientBoostingRegressor` model pipeline with automated preprocessing:
  - Median Imputer & StandardScaler for numerical features
  - Most-Frequent Imputer & One-Hot Encoding for categorical features (`ocean_proximity`)
- **Interactive California Map**: Built-in Leaflet.js interactive map centered on California coordinates. Click anywhere or drag the pin to update latitude and longitude.
- **One-Click Presets**:
  - 🌉 **SF Bay Area Villa** (Notebook Cell 50 test case: `$443,310.96`)
  - 🏖️ **Santa Monica Beachfront**
  - 🏙️ **San Diego Coastal**
  - 🌲 **Sacramento Suburban**
  - 🌾 **Central Valley Inland**
- **Dynamic Derived Metrics**: Live calculations of:
  - Rooms per Household
  - Bedrooms per Room
  - Average Household Size
- **Live State Benchmark**: Compares predicted valuations against the California state median ($179,700).

---

## 🛠️ Project Structure

```
1st ml project/
├── house_predict_model.ipynb   # Original exploratory analysis & pipeline training
├── housing.csv                 # California Housing dataset (20,640 records)
├── house_model.joblib          # Exported trained Scikit-Learn model pipeline
├── app.py                      # Flask backend (API & static file server)
├── start_gui.bat               # Windows 1-click launcher
├── static/
│   ├── index.html              # Modern responsive HTML5 GUI
│   ├── css/
│   │   └── style.css           # Premium dark-theme & glassmorphism CSS
│   └── js/
│       └── app.js              # Leaflet map, form handling & animation logic
└── README.md                   # Documentation
```

---

## ⚡ How to Run

### Method 1: Double-Click Launcher (Windows)
Double-click [`start_gui.bat`](./start_gui.bat). It automatically starts the Python server and opens `http://localhost:5000` in your default browser.

### Method 2: Command Line
Open your terminal inside this folder:
```bash
python app.py
```
Then navigate to:
```
http://localhost:5000
```

---

## 🔌 API Endpoints

### 1. `POST /api/predict`
Accepts a JSON payload with the 9 housing features:
```json
{
  "longitude": -122.23,
  "latitude": 37.88,
  "housing_median_age": 41,
  "total_rooms": 880,
  "total_bedrooms": 129,
  "population": 322,
  "households": 126,
  "median_income": 8.32,
  "ocean_proximity": "NEAR BAY"
}
```

Response:
```json
{
  "success": true,
  "prediction": 443310.96,
  "formatted_price": "$443,311",
  "market_tier": "Luxury Market",
  "market_tier_class": "luxury",
  "comparison_to_ca_median_pct": 146.7,
  "derived_metrics": {
    "rooms_per_household": 6.98,
    "bedrooms_per_room": 0.147,
    "population_per_household": 2.56,
    "annual_income_est": "$83,200"
  }
}
```

### 2. `GET /api/info`
Returns model pipeline configuration, features, and benchmark metrics.

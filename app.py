import os
import joblib
import pandas as pd
import numpy as np
from flask import Flask, request, jsonify, send_from_directory

app = Flask(__name__, static_folder="static", static_url_path="")

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_PATH = os.path.join(BASE_DIR, "house_model.joblib")
DATA_PATH = os.path.join(BASE_DIR, "housing.csv")

def train_and_cache_model():
    """Train HistGradientBoosting model pipeline if model file is missing."""
    from sklearn.model_selection import train_test_split
    from sklearn.pipeline import Pipeline
    from sklearn.preprocessing import StandardScaler, OneHotEncoder
    from sklearn.impute import SimpleImputer
    from sklearn.compose import ColumnTransformer
    from sklearn.ensemble import HistGradientBoostingRegressor

    print("[ML] Training model pipeline from housing.csv...")
    df = pd.read_csv(DATA_PATH)
    X = df.drop(columns=["median_house_value"])
    y = df["median_house_value"]

    X_train, _, y_train, _ = train_test_split(X, y, test_size=0.2, random_state=42)

    numerical_features = X_train.select_dtypes(include=[np.number]).columns.tolist()
    categorical_features = X_train.select_dtypes(exclude=[np.number]).columns.tolist()

    numeric_transformer = Pipeline(
        steps=[
            ("imputer", SimpleImputer(strategy="median")),
            ("scaler", StandardScaler())
        ]
    )

    categorical_transformer = Pipeline(
        steps=[
            ("imputer", SimpleImputer(strategy="most_frequent")),
            ("onehot", OneHotEncoder(handle_unknown="ignore"))
        ]
    )

    preprocess = ColumnTransformer(
        transformers=[
            ("num", numeric_transformer, numerical_features),
            ("cat", categorical_transformer, categorical_features)
        ]
    )

    pipe = Pipeline(
        steps=[
            ("preprocess", preprocess),
            ("model", HistGradientBoostingRegressor(
                l2_regularization=0.1,
                learning_rate=0.1,
                max_depth=None,
                max_leaf_nodes=63,
                min_samples_leaf=20,
                random_state=42
            ))
        ]
    )

    pipe.fit(X_train, y_train)
    joblib.dump(pipe, MODEL_PATH)
    print(f"[ML] Model trained and saved to {MODEL_PATH}")
    return pipe

# Load model pipeline
if os.path.exists(MODEL_PATH):
    print(f"[ML] Loading existing model from {MODEL_PATH}...")
    try:
        model = joblib.load(MODEL_PATH)
    except Exception as e:
        print(f"[ML] Warning: Failed to load {MODEL_PATH} ({e}). Retraining...")
        model = train_and_cache_model()
else:
    model = train_and_cache_model()

@app.after_request
def add_cors_headers(response):
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type,Authorization"
    response.headers["Access-Control-Allow-Methods"] = "GET,PUT,POST,DELETE,OPTIONS"
    return response

@app.route("/", defaults={"path": ""})
@app.route("/<path:path>")
def serve_static(path):
    if path != "" and os.path.exists(os.path.join(app.static_folder, path)):
        return send_from_directory(app.static_folder, path)
    return send_from_directory(app.static_folder, "index.html")

@app.route("/api/info", methods=["GET"])
def model_info():
    return jsonify({
        "status": "online",
        "model_name": "HistGradientBoostingRegressor Pipeline",
        "features": {
            "numerical": [
                "longitude", "latitude", "housing_median_age", 
                "total_rooms", "total_bedrooms", "population", 
                "households", "median_income"
            ],
            "categorical": ["ocean_proximity"]
        },
        "ocean_proximity_options": ["<1H OCEAN", "INLAND", "NEAR OCEAN", "NEAR BAY", "ISLAND"],
        "california_benchmarks": {
            "state_median_value": 179700.0,
            "min_recorded_value": 14999.0,
            "max_recorded_value": 500001.0
        }
    })

@app.route("/api/predict", methods=["POST"])
def predict():
    try:
        data = request.get_json(force=True)
        
        # Extract inputs with validation & defaults
        longitude = float(data.get("longitude", -122.23))
        latitude = float(data.get("latitude", 37.88))
        housing_median_age = float(data.get("housing_median_age", 28))
        total_rooms = float(data.get("total_rooms", 2127))
        total_bedrooms = float(data.get("total_bedrooms", 435)) if data.get("total_bedrooms") not in [None, ""] else np.nan
        population = float(data.get("population", 1166))
        households = float(data.get("households", 409))
        median_income = float(data.get("median_income", 3.85))
        ocean_proximity = str(data.get("ocean_proximity", "NEAR BAY")).strip()

        # Build single-row DataFrame exactly matching training features
        input_df = pd.DataFrame([{
            "longitude": longitude,
            "latitude": latitude,
            "housing_median_age": housing_median_age,
            "total_rooms": total_rooms,
            "total_bedrooms": total_bedrooms,
            "population": population,
            "households": households,
            "median_income": median_income,
            "ocean_proximity": ocean_proximity
        }])

        raw_pred = float(model.predict(input_df)[0])
        pred_value = max(10000.0, raw_pred) # logical lower bound

        # Market tier classification
        if pred_value >= 400000:
            tier = "Luxury Market"
            tier_class = "luxury"
        elif pred_value >= 260000:
            tier = "High-End Suburban"
            tier_class = "high"
        elif pred_value >= 160000:
            tier = "Moderate / Median"
            tier_class = "moderate"
        else:
            tier = "Affordable Housing"
            tier_class = "affordable"

        rooms_per_household = round(total_rooms / households, 2) if households > 0 else 0
        bedrooms_per_room = round(total_bedrooms / total_rooms, 3) if total_rooms > 0 and not np.isnan(total_bedrooms) else None
        pop_per_household = round(population / households, 2) if households > 0 else 0

        return jsonify({
            "success": True,
            "prediction": round(pred_value, 2),
            "formatted_price": f"${pred_value:,.0f}",
            "market_tier": tier,
            "market_tier_class": tier_class,
            "comparison_to_ca_median_pct": round(((pred_value - 179700.0) / 179700.0) * 100, 1),
            "derived_metrics": {
                "rooms_per_household": rooms_per_household,
                "bedrooms_per_room": bedrooms_per_room,
                "population_per_household": pop_per_household,
                "annual_income_est": f"${median_income * 10000:,.0f}"
            }
        })
    except Exception as e:
        return jsonify({
            "success": False,
            "error": str(e)
        }), 400

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    print(f"Server starting on http://localhost:{port}")
    app.run(host="0.0.0.0", port=port, debug=False)

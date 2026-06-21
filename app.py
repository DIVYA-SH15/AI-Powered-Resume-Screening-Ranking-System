"""
app.py – Flask backend for Resume Screening Dashboard
Endpoints:
  GET  /            – serve index.html
  POST /api/screen  – JSON or form+file, returns ranked candidates
  GET  /api/health  – health check
"""
import io
import os
import pandas as pd
from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

app = Flask(__name__, static_folder=BASE_DIR, static_url_path="")
CORS(app)

BUILTIN_CSV = os.path.join(BASE_DIR, "resumes.csv")


def run_screening(df: pd.DataFrame, job_description: str) -> list:
    df = df.copy()
    df.columns = df.columns.str.strip()

    required = {"Candidate", "Resume"}
    missing = required - set(df.columns)
    if missing:
        raise KeyError(f"CSV is missing columns: {missing}. Found: {df.columns.tolist()}")

    if "Experience" not in df.columns:
        df["Experience"] = 0

    vectorizer = TfidfVectorizer(stop_words="english")
    all_texts = [job_description] + df["Resume"].astype(str).tolist()
    vectors = vectorizer.fit_transform(all_texts)

    scores = cosine_similarity(vectors[0:1], vectors[1:]).flatten()
    df["match_score"] = (scores * 100).round(2)

    # Top keywords per candidate (shared with JD)
    jd_terms = set(job_description.lower().split())
    def shared_keywords(resume_text):
        words = set(str(resume_text).lower().split())
        return list(words & jd_terms)

    df["keywords"] = df["Resume"].apply(shared_keywords)

    ranked = df.sort_values("match_score", ascending=False).reset_index(drop=True)
    ranked["rank"] = ranked.index + 1

    # Grade label
    def grade(score):
        if score >= 80: return "Excellent"
        if score >= 60: return "Good"
        if score >= 40: return "Fair"
        return "Low"

    ranked["grade"] = ranked["match_score"].apply(grade)

    result = []
    for _, row in ranked.iterrows():
        result.append({
            "rank":        int(row["rank"]),
            "candidate":   str(row["Candidate"]),
            "experience":  int(row["Experience"]),
            "resume":      str(row["Resume"]),
            "match_score": float(row["match_score"]),
            "grade":       row["grade"],
            "keywords":    row["keywords"],
        })
    return result


@app.route("/")
def index():
    return send_from_directory(BASE_DIR, "index.html")


@app.route("/api/health")
def health():
    return jsonify({"status": "ok"})


@app.route("/api/screen", methods=["POST"])
def screen():
    try:
        job_description = request.form.get("job_description", "").strip()
        if not job_description:
            data = request.get_json(silent=True) or {}
            job_description = data.get("job_description", "").strip()
        if not job_description:
            return jsonify({"ok": False, "error": "job_description is required"}), 400

        uploaded = request.files.get("file")
        if uploaded and uploaded.filename:
            raw = uploaded.read()
            df = pd.read_csv(io.BytesIO(raw))
            source = uploaded.filename
        else:
            df = pd.read_csv(BUILTIN_CSV)
            source = "resumes.csv"

        candidates = run_screening(df, job_description)

        return jsonify({
            "ok": True,
            "source": source,
            "total": len(candidates),
            "job_description": job_description,
            "candidates": candidates
        })

    except Exception as exc:
        return jsonify({"ok": False, "error": str(exc)}), 400


if __name__ == "__main__":
    app.run(debug=True, host="0.0.0.0", port=5002)

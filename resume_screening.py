import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

# Load resumes
df = pd.read_csv("resumes.csv")

# Job Description
job_description = "Python Machine Learning NLP Data Science"

# TF-IDF
vectorizer = TfidfVectorizer()

vectors = vectorizer.fit_transform(
    [job_description] + df["Resume"].tolist()
)

# Similarity Scores
scores = cosine_similarity(
    vectors[0:1],
    vectors[1:]
).flatten()

df["Match Score"] = scores * 100

# Ranking
ranked = df.sort_values(
    by="Match Score",
    ascending=False
)

print("\nCandidate Ranking")
print("-" * 40)

print(
    ranked[
        ["Candidate",
         "Experience",
         "Match Score"]
    ]
)
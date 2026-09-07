# Data science / ML design checklist

For notebooks, data pipelines, and model training/inference code — a different
risk profile than application code: correctness bugs here are silent (a wrong
number, not a crash) and much more expensive to notice late.

- Reproducibility: every run is seedable (`random`/`numpy`/framework seeds fixed) and a training/pipeline script records its inputs — data version/hash, library versions, hyperparameters — so a result can be reproduced or diffed later.
- Data leakage: fit any transform (scaler, encoder, imputer, vectorizer) on the training split only, then apply it to validation/test/inference — never fit on the full dataset before splitting. Flag any `.fit()`/`.fit_transform()` call before a train/test split exists.
- Notebook hygiene: a notebook intended to ship logic (not just explore) has its reusable functions extracted into an importable module with tests — cell-order-dependent state that only works "run all from top" is a correctness risk, not a style nit.
- Validate data shape at the boundary: assert expected schema/dtypes/ranges when a pipeline reads external data (a new column, an unexpected null rate, an out-of-range value) rather than letting a silent NaN propagate into a trained model.
- Determinism vs. flexibility: pin the exact library versions a model was trained/evaluated with (`requirements.txt`/lockfile), since many numerical libraries change results across versions even at the same seed.
- Evaluate on a held-out set that was never touched during feature engineering or hyperparameter search — report the metric a stakeholder will actually see, not just training-set performance.
- Resource awareness: a training/inference loop over large data uses batching/streaming (not a single in-memory load) unless the dataset is provably small; GPU/memory usage is bounded, not assumed available.
- Test seams: pure data-transform functions are unit-testable on small fixture inputs with known expected outputs — don't require a full dataset or trained model to test the transform logic itself.

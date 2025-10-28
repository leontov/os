from ml_templates import (
    ClassificationTemplate,
    DatasetProfile,
    GenerativeTemplate,
    RecommendationTemplate,
)


def test_classification_confusion_penalty() -> None:
    dataset = DatasetProfile(name="cls", samples=1000, features=("a",), target="y")
    template = ClassificationTemplate(
        name="classifier",
        dataset=dataset,
        preprocessors=("scale",),
        trainer="xgboost",
        evaluators=(),
        classes=("yes", "no"),
    )
    template.evaluators = (lambda metrics: template.evaluate_accuracy(metrics[0], 0.8),)
    penalty = template.confusion_penalty([[8, 2], [1, 9]])
    assert 0 <= penalty < 0.5


def test_recommendation_diversification() -> None:
    dataset = DatasetProfile(name="rec", samples=500, features=("user",), target="item")
    template = RecommendationTemplate(
        name="recommender",
        dataset=dataset,
        preprocessors=("normalize",),
        trainer="matrix-factorization",
        evaluators=(),
        objectives=("focus", "energy"),
    )
    template.evaluators = (lambda metrics: template.evaluate_ctr(metrics[0], 0.5),)
    score = template.diversification_score({"focus": 3, "energy": 1})
    assert 0 < score <= 1


def test_generative_coherence() -> None:
    dataset = DatasetProfile(name="gen", samples=10000, features=("prompt",), target="artifact")
    template = GenerativeTemplate(
        name="generator",
        dataset=dataset,
        preprocessors=("safety",),
        trainer="transformer",
        evaluators=(),
        modalities=("text",),
    )
    template.evaluators = (lambda metrics: template.coherence_score(metrics),)
    readiness = template.readiness((0.9,))
    assert readiness == 1.0

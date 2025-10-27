from apps.flagship import CreativeStudio, ExperienceReview, ProductivityConsole


def test_creative_studio_produces_experience() -> None:
    studio = CreativeStudio.default()
    review = studio.produce([0.9, 0.95, 0.92])
    assert isinstance(review, ExperienceReview)
    assert review.app == "creative"
    assert review.meets_targets() is True or review.nps > 40


def test_productivity_console_balances_objectives() -> None:
    console = ProductivityConsole.default()
    review = console.orchestrate({"focus": 3, "flow": 2, "energy": 1}, ctr=0.7)
    assert review.app == "productivity"
    assert review.satisfaction > 0.8
    assert review.retention > 0.7

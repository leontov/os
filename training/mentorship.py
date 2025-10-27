"""Наставническая программа «Колибри ИИ».

Модуль закрывает оставшийся пункт Фазы 2 дорожной карты: запуск
образовательной программы и наставничества для исследовательских команд.
Он предоставляет структуры данных для описания курсов, менторов и
участников, алгоритм составления учебных траекторий и загрузку конфигурации
из JSON/словарей для CLI и внутренних сервисов.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, Iterable, Mapping


@dataclass(frozen=True, slots=True)
class Course:
    """Учебный курс с привязкой к компетенциям и лабораторным занятиям."""

    course_id: str
    title: str
    duration_hours: int
    competencies: frozenset[str]
    lab_required: bool = False

    def coverage_ratio(self, goals: Iterable[str]) -> float:
        """Возвращает долю целей, покрываемых курсом."""

        goals_set = frozenset(goal.lower() for goal in goals)
        if not goals_set:
            return 0.0
        overlap = len(self.competencies & goals_set)
        return overlap / len(goals_set)


@dataclass(frozen=True, slots=True)
class Mentor:
    """Ментор с ограничением по одновременным подопечным."""

    name: str
    specialization: frozenset[str]
    capacity: int

    def supports(self, goals: Iterable[str]) -> int:
        """Количество совпадающих целей."""

        return len(self.specialization & frozenset(goal.lower() for goal in goals))


@dataclass(frozen=True, slots=True)
class Mentee:
    """Участник программы с целями развития и исходным уровнем."""

    name: str
    goals: tuple[str, ...]
    baseline_score: float


@dataclass(frozen=True, slots=True)
class Session:
    """Занятие наставничества."""

    week: int
    mentor: str
    mentee: str
    course_id: str
    focus: str


@dataclass(frozen=True, slots=True)
class CohortSummary:
    """Агрегированные метрики для программы наставничества."""

    total_sessions: int
    unique_courses: tuple[str, ...]
    mentor_utilization: Mapping[str, float]
    mentee_goal_coverage: Mapping[str, float]
    uncovered_goals: Mapping[str, tuple[str, ...]]
    recommended_courses: Mapping[str, tuple[str, ...]]
    average_sessions_per_week: float

    def to_dict(self) -> dict[str, object]:
        """Преобразовать метрики в сериализуемый словарь."""

        return {
            "total_sessions": self.total_sessions,
            "unique_courses": list(self.unique_courses),
            "mentor_utilization": dict(self.mentor_utilization),
            "mentee_goal_coverage": dict(self.mentee_goal_coverage),
            "uncovered_goals": {key: list(value) for key, value in self.uncovered_goals.items()},
            "recommended_courses": {
                key: list(value) for key, value in self.recommended_courses.items()
            },
            "average_sessions_per_week": self.average_sessions_per_week,
        }


@dataclass(frozen=True, slots=True)
class JourneyResult:
    """Результат планирования программы наставничества."""

    sessions: tuple[Session, ...]
    mentor_load: Mapping[str, int]
    mentee_goal_coverage: Mapping[str, float]
    uncovered_goals: Mapping[str, tuple[str, ...]]
    recommended_courses: Mapping[str, tuple[str, ...]]
    weeks: int
    sessions_per_week: int

    def summary(self, program: MentorshipProgram) -> CohortSummary:
        """Подсчитать агрегированные метрики по сгенерированному плану."""

        total_sessions = len(self.sessions)
        unique_courses = tuple(sorted({session.course_id for session in self.sessions}))
        average_sessions_per_week = (
            total_sessions / self.weeks if self.weeks > 0 else 0.0
        )

        mentor_utilization: Dict[str, float] = {}
        for mentor in program.mentors:
            capacity = mentor.capacity * self.weeks * self.sessions_per_week
            load = self.mentor_load.get(mentor.name, 0)
            mentor_utilization[mentor.name] = load / capacity if capacity else 0.0

        return CohortSummary(
            total_sessions=total_sessions,
            unique_courses=unique_courses,
            mentor_utilization=mentor_utilization,
            mentee_goal_coverage=self.mentee_goal_coverage,
            uncovered_goals=self.uncovered_goals,
            recommended_courses=self.recommended_courses,
            average_sessions_per_week=average_sessions_per_week,
        )


@dataclass(slots=True)
class MentorshipProgram:
    """Конфигурация программы наставничества."""

    courses: tuple[Course, ...]
    mentors: tuple[Mentor, ...]
    mentees: tuple[Mentee, ...]
    sessions_per_week: int = 1

    def mentor_for(self, mentee: Mentee) -> Mentor:
        """Выбрать лучшего доступного ментора."""

        best: Mentor | None = None
        best_score = -1
        for mentor in self.mentors:
            score = mentor.supports(mentee.goals)
            if score > best_score:
                best = mentor
                best_score = score
        if best is None:
            raise ValueError("Нет доступных менторов для программы")
        return best

    def recommend_courses(self, mentee: Mentee, *, limit: int = 3) -> list[Course]:
        """Подбор курсов по степени покрытия целей и энергоэффективности."""

        sorted_courses = sorted(
            self.courses,
            key=lambda course: (
                course.coverage_ratio(mentee.goals),
                -course.duration_hours,
                course.lab_required,
            ),
            reverse=True,
        )
        return sorted_courses[:limit]


def load_program_from_mapping(config: Mapping[str, object]) -> MentorshipProgram:
    """Собрать программу из словаря, например из JSON."""

    try:
        courses_raw = config["courses"]
        mentors_raw = config["mentors"]
        mentees_raw = config["mentees"]
    except KeyError as exc:  # pragma: no cover - защитная ветка
        missing = exc.args[0]
        raise ValueError(f"Отсутствует обязательный раздел: {missing}") from exc

    courses = tuple(
        Course(
            course_id=str(item["id"]),
            title=str(item.get("title", item["id"])),
            duration_hours=int(item.get("duration_hours", 4)),
            competencies=frozenset(
                str(value).lower() for value in item.get("competencies", ())
            ),
            lab_required=bool(item.get("lab_required", False)),
        )
        for item in courses_raw  # type: ignore[arg-type]
    )
    mentors = tuple(
        Mentor(
            name=str(item["name"]),
            specialization=frozenset(
                str(value).lower() for value in item.get("specialization", ())
            ),
            capacity=int(item.get("capacity", 1)),
        )
        for item in mentors_raw  # type: ignore[arg-type]
    )
    mentees = tuple(
        Mentee(
            name=str(item["name"]),
            goals=tuple(str(value) for value in item.get("goals", ())),
            baseline_score=float(item.get("baseline_score", 0.0)),
        )
        for item in mentees_raw  # type: ignore[arg-type]
    )

    return MentorshipProgram(courses=courses, mentors=mentors, mentees=mentees)


def build_learning_journey(
    program: MentorshipProgram,
    *,
    weeks: int,
    target_score: float = 0.8,
) -> JourneyResult:
    """Составить план занятий и вернуть расширенные метрики."""

    if weeks <= 0:
        raise ValueError("Количество недель должно быть положительным")

    sessions: list[Session] = []
    mentor_load: Dict[str, int] = {mentor.name: 0 for mentor in program.mentors}
    mentee_coverage: Dict[str, float] = {}
    uncovered_goals: Dict[str, tuple[str, ...]] = {}
    recommended_courses: Dict[str, tuple[str, ...]] = {}

    for mentee in program.mentees:
        mentor = program.mentor_for(mentee)
        available_capacity = mentor.capacity * weeks * program.sessions_per_week
        remaining_capacity = available_capacity - mentor_load[mentor.name]
        if remaining_capacity <= 0:
            raise ValueError(f"У ментора {mentor.name} нет слотов для занятий")

        recommended = program.recommend_courses(mentee)
        if not recommended:
            raise ValueError(f"Для участника {mentee.name} не найдено подходящих курсов")

        recommended_courses[mentee.name] = tuple(course.course_id for course in recommended)
        covered_competencies = {
            value for course in recommended for value in course.competencies
        }
        goals = tuple(goal.lower() for goal in mentee.goals)
        coverage_ratio = (
            len(set(goals) & covered_competencies) / len(goals)
            if goals
            else 1.0
        )
        mentee_coverage[mentee.name] = coverage_ratio
        uncovered_goals[mentee.name] = tuple(
            goal for goal in mentee.goals if goal.lower() not in covered_competencies
        )

        desired_sessions = min(weeks * program.sessions_per_week, remaining_capacity)
        assigned = 0
        for week in range(1, weeks + 1):
            for _ in range(program.sessions_per_week):
                if assigned >= desired_sessions:
                    break
                course = recommended[assigned % len(recommended)]
                focus = "лаборатория" if course.lab_required else "семинар"
                sessions.append(
                    Session(
                        week=week,
                        mentor=mentor.name,
                        mentee=mentee.name,
                        course_id=course.course_id,
                        focus=focus,
                    )
                )
                mentor_load[mentor.name] += 1
                assigned += 1
            if assigned >= desired_sessions:
                break

        progress_gap = max(0.0, target_score - mentee.baseline_score)
        extra_target = max(0, int(round(progress_gap * len(recommended))) - 1)
        extra_capacity = available_capacity - mentor_load[mentor.name]
        for extra_index in range(min(extra_target, extra_capacity)):
            course = recommended[(assigned + extra_index) % len(recommended)]
            sessions.append(
                Session(
                    week=weeks + extra_index + 1,
                    mentor=mentor.name,
                    mentee=mentee.name,
                    course_id=course.course_id,
                    focus="практикум",
                )
            )
            mentor_load[mentor.name] += 1

    return JourneyResult(
        sessions=tuple(sessions),
        mentor_load=mentor_load,
        mentee_goal_coverage=mentee_coverage,
        uncovered_goals=uncovered_goals,
        recommended_courses=recommended_courses,
        weeks=weeks,
        sessions_per_week=program.sessions_per_week,
    )

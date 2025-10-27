"""Наставническая программа «Колибри ИИ».

Модуль закрывает оставшийся пункт Фазы 2 дорожной карты: запуск
образовательной программы и наставничества для исследовательских команд.
Он предоставляет структуры данных для описания курсов, менторов и
участников, алгоритм составления учебных траекторий и загрузку конфигурации
из JSON/словарей для CLI и внутренних сервисов.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable, Mapping


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
) -> list[Session]:
    """Составить план занятий для всех участников."""

    if weeks <= 0:
        raise ValueError("Количество недель должно быть положительным")

    sessions: list[Session] = []
    mentor_load: dict[str, int] = {mentor.name: 0 for mentor in program.mentors}

    for mentee in program.mentees:
        mentor = program.mentor_for(mentee)
        available_capacity = mentor.capacity * weeks * program.sessions_per_week
        if available_capacity <= 0:
            raise ValueError(f"У ментора {mentor.name} нет слотов для занятий")

        recommended = program.recommend_courses(mentee)
        progress_gap = max(0.0, target_score - mentee.baseline_score)
        repetitions = max(1, round(progress_gap * len(recommended)))

        for week in range(weeks):
            for idx in range(program.sessions_per_week):
                course = recommended[(week + idx) % len(recommended)]
                if mentor_load[mentor.name] >= available_capacity:
                    break
                focus = "лаборатория" if course.lab_required else "семинар"
                sessions.append(
                    Session(
                        week=week + 1,
                        mentor=mentor.name,
                        mentee=mentee.name,
                        course_id=course.course_id,
                        focus=focus,
                    )
                )
                mentor_load[mentor.name] += 1
        if repetitions > 1:
            sessions.extend(
                Session(
                    week=weeks + i + 1,
                    mentor=mentor.name,
                    mentee=mentee.name,
                    course_id=recommended[i % len(recommended)].course_id,
                    focus="практикум",
                )
                for i in range(repetitions - 1)
            )

    return sessions

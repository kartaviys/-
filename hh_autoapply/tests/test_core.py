import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from hh_autoapply.__main__ import _title_ok  # noqa: E402
from hh_autoapply.browser import FORBIDDEN_RE, SALARY_RE, _closest_salary_option  # noqa: E402
from hh_autoapply.lang import detect_language  # noqa: E402
from hh_autoapply.llm import parse_json  # noqa: E402
from hh_autoapply.storage import Storage  # noqa: E402


class LangTest(unittest.TestCase):
    def test_russian_with_tech_terms(self):
        text = ("<p>Ищем Senior Data Scientist в команду ML. Стек: Python, PyTorch, SQL, Spark, "
                "Airflow. Задачи: построение моделей кредитного скоринга, A/B тесты.</p>")
        self.assertEqual(detect_language(text), "ru")

    def test_english(self):
        text = ("<p>We are looking for a Senior ML Engineer to join our growing team. You will "
                "design, train and deploy models that power our recommendation system.</p>")
        self.assertEqual(detect_language(text), "en")


class FilterTest(unittest.TestCase):
    filt = {"title_include": ["data scien", "ml", "аналитик данных", "data analyst"],
            "title_exclude": ["junior", "стажер", "lead"]}

    def test_include_exclude(self):
        self.assertTrue(_title_ok("Senior Data Scientist", self.filt))
        self.assertTrue(_title_ok("Ведущий аналитик данных", self.filt))
        self.assertFalse(_title_ok("Junior Data Scientist", self.filt))
        self.assertFalse(_title_ok("Стажер ML", self.filt))
        self.assertFalse(_title_ok("Java Developer", self.filt))


class SalaryTest(unittest.TestCase):
    def test_salary_regex(self):
        for q in ["Ваши зарплатные ожидания?", "Желаемый уровень дохода", "Expected salary",
                  "Укажите ожидания по з/п", "Desired compensation"]:
            self.assertTrue(SALARY_RE.search(q), q)
        self.assertFalse(SALARY_RE.search("Сколько лет опыта с Python?"))

    def test_forbidden(self):
        self.assertTrue(FORBIDDEN_RE.search("Пароль"))
        self.assertTrue(FORBIDDEN_RE.search("Номер карты"))

    def test_range_options(self):
        opts = [{"id": "a", "label": "до 20 000"}, {"id": "b", "label": "20 000 – 40 000"},
                {"id": "c", "label": "от 40 000"}]
        self.assertEqual(_closest_salary_option(opts, "25000"), "b")


class JsonTest(unittest.TestCase):
    def test_parse_fenced(self):
        self.assertEqual(parse_json('```json\n{"answers": {"f0": "x"}}\n```'), {"answers": {"f0": "x"}})
        self.assertEqual(parse_json('Вот ответ: {"a": 1} спасибо'), {"a": 1})


class StorageTest(unittest.TestCase):
    def test_seen(self):
        with tempfile.TemporaryDirectory() as d:
            s = Storage(os.path.join(d, "t.db"))
            v = {"id": 1, "name": "DS", "employer": {"name": "X"}}
            self.assertFalse(s.seen("1"))
            s.record(v, "ru", "dry_run", "api")
            self.assertFalse(s.seen("1"))  # после dry_run реальный отклик всё ещё возможен
            s.record(v, "ru", "applied", "api")
            self.assertTrue(s.seen("1"))
            self.assertEqual(s.applied_today(), 1)


if __name__ == "__main__":
    unittest.main()

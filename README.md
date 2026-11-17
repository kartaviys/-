# Автоотклик на вакансии: hh.ru, Хабр Карьера, LinkedIn и ещё 22 сайта

Браузерные агенты, которые сами ищут вакансии Data Scientist / ML / AI / NLP / Data Analyst, отсеивают неподходящие
(фильтр названий + проверка нейросетью), пишут сопроводительное письмо под каждую вакансию и откликаются.

- **[Android-приложение](android/README.md)** — основной вариант: 25 агентов (hh, Хабр Карьера, LinkedIn,
  SuperJob, сайты российских компаний, США, ОАЭ, Европа), ODS, журнал, учёт расходов. Подробная инструкция — по ссылке.
  **Скачать APK:** https://github.com/kartaviys/-/releases/download/hh-autoapply-latest/hh-autoapply.apk
- **[Python-версия](hh_autoapply/README.md)** — упрощённый скрипт для компьютера: отклики через официальный API hh.

Нейросеть: Claude (по умолчанию Claude Haiku 5.5), DeepSeek или своя модель (Ollama, LM Studio, любой
OpenAI-совместимый API).

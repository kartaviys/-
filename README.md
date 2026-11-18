# Автоотклик на вакансии: hh.ru, Хабр Карьера, LinkedIn и ещё 23 сайта

Браузерные агенты, которые сами ищут вакансии Data Scientist / ML / AI / NLP / Data Analyst, отсеивают неподходящие
(фильтр названий + проверка нейросетью), пишут сопроводительное письмо под каждую вакансию и откликаются.

| Версия | Скачать | Инструкция |
|---|---|---|
| **Android** — основной вариант: 26 агентов, ODS, площадки авто-сбора, работа в фоне | [hh-autoapply.apk](https://github.com/kartaviys/-/releases/download/hh-autoapply-latest/hh-autoapply.apk) | [android/README.md](android/README.md) |
| **Windows** — те же 26 агентов в вашем Chrome/Edge | [hh-autoapply-windows-setup.exe](https://github.com/kartaviys/-/releases/download/hh-autoapply-desktop-latest/hh-autoapply-windows-setup.exe) | [desktop/README.md](desktop/README.md) |
| **macOS** (Apple Silicon и Intel) | [hh-autoapply-macos.dmg](https://github.com/kartaviys/-/releases/download/hh-autoapply-desktop-latest/hh-autoapply-macos.dmg) | [desktop/README.md](desktop/README.md) |
| **iPhone** — пульт к версии для компьютера: Safari по Wi-Fi, вход по PIN | ничего ставить не нужно | [desktop/README.md → Пульт с iPhone](desktop/README.md#-пульт-с-iphone) |
| **Python** — упрощённый скрипт: отклики через официальный API hh | — | [hh_autoapply/README.md](hh_autoapply/README.md) |

Нейросеть: Claude (по умолчанию Claude Haiku 5.5), DeepSeek или своя модель (Ollama, LM Studio, любой OpenAI-совместимый API).
Claude из России работает только через VPN (иначе ошибка 403); DeepSeek — без VPN.

package com.technews.pulse.filter

import com.technews.pulse.data.AppSettings

/** Один сработавший признак: «+3 benchmark (заголовок)». */
data class Signal(val label: String, val weight: Int)

data class Verdict(
    val score: Int,
    val passed: Boolean,
    val tags: List<String>,
    val signals: List<Signal>,
)

/**
 * Эвристический фильтр «техническая статья или хайп».
 *
 * Плюсы дают признаки содержательного материала: статьи/препринты, бенчмарки,
 * архитектуры, обучение, инференс, железо, код, разборы «как это устроено».
 * Минусы — «говорящие головы» (CEO сказал/предупредил), страшилки
 * («ИИ захватит мир»), бизнес-новости (акции, раунды), политика и суды, драмы.
 *
 * Заголовок весит больше описания: хайп почти всегда виден в заголовке.
 */
object TechFilter {

    private class Rule(val label: String, pattern: String, val weight: Int) {
        val regex = Regex(expand(pattern), RegexOption.IGNORE_CASE)
    }

    /**
     * Мини-синтаксис паттернов:
     *  `~`  — любое окончание слова (\p{L}*), например `квантиз~`;
     *  `_`  — пробел или дефис между словами (fine_tuning → fine-tuning / fine tuning / finetuning).
     * Шаблон автоматически обрамляется Unicode-границами слова (работает и для кириллицы).
     */
    private fun expand(p: String): String {
        val body = p.replace("~", "\\p{L}*").replace("_", "[\\s\\-]?")
        return "(?<![\\p{L}\\p{N}])(?:$body)(?![\\p{L}\\p{N}])"
    }

    private fun r(label: String, pattern: String, weight: Int) = Rule(label, pattern, weight)

    // ---------------- Положительные признаки ----------------
    private val positive = listOf(
        // Сильные: почти наверняка содержательный технический материал
        r("arXiv/статья", "arxiv|preprint|technical report|tech report|paper|openreview", 3),
        r("бенчмарк", "benchmark~|бенчмарк~|leaderboard|swe_bench|mmlu~|gpqa|humaneval|arc_agi~|livecodebench|evals?", 3),
        r("датасет", "dataset~|датасет~|набор~ данных|corpus|synthetic data", 3),
        r("ablation", "ablation~|абляци~", 3),
        r("дообучение", "fine_tun~|finetun~|дообучени~|файн_?тюн~|sft|instruction tuning", 3),
        r("предобучение", "pre_?train~|post_?train~|предобучени~|pretraining", 3),
        r("RL-обучение", "rlhf|rlaif|rlvr|dpo|grpo|ppo|reinforcement learning|reward model~|обучени~ с подкреплением", 3),
        r("квантизация", "quantiz~|квантиз~|квантован~|int4|int8|fp8|fp4|gguf|awq|gptq", 3),
        r("дистилляция", "distill~|дистилл~", 3),
        r("LoRA/PEFT", "q?lora|peft|adapter~", 3),
        r("инференс-оптимизация", "kv_cache|speculative decoding|paged attention|flash_?attention|continuous batching|prefill", 3),
        r("MoE", "mixture_of_experts|moe", 3),
        r("интерпретируемость", "interpretab~|mechanistic|sparse autoencoder~|saes?|circuits|интерпретируем~|probing", 3),
        r("scaling laws", "scaling laws?|законы? масштабирования|compute_optimal", 3),
        r("GPU-программирование", "cuda|triton|kernels?|ptx|cutlass|rocm|ядр~ cuda", 3),
        r("разбор", "deep dive|under the hood|from scratch|how we built|how it works|walkthrough|internals|под капотом|с нуля|как мы|разбор~|как устроен~|как работает", 3),
        r("инструменты инференса", "vllm|sglang|llama\\.cpp|ollama|tensorrt~|onnx|mlx|exllama~", 3),
        r("открытые веса", "open_weights?|open_source~|опенсорс~|открыт~ (?:вес~|код~|исходн~)|weights released|apache 2\\.0|mit license", 3),

        // Средние
        r("архитектура", "architecture~|архитектур~|transformer~|трансформер~|attention|внимани~|state space model~|mamba|rnn|ssm", 2),
        r("инференс", "inference|инференс~|throughput|latency|задержк~|tokens per second|tok/s|пропускн~", 2),
        r("токены/контекст", "tokeniz~|токениз~|context (?:window|length)|длин~ контекст~|контекстн~ окн~|long context", 2),
        r("эмбеддинги/RAG", "embedding~|эмбеддинг~|retrieval|rag|vector (?:db|database|search)|векторн~ (?:поиск|баз~)|reranker~", 2),
        r("генеративные модели", "diffusion|диффузи~|flow matching|vae|gan|autoregressive", 2),
        r("мультимодальность", "multimodal|мультимодальн~|vision_language|vlm|speech recognition|asr|tts|распознавани~ речи", 2),
        r("рассуждения", "reasoning|рассуждени~|chain_of_thought|cot|test_time compute|inference_time scaling", 2),
        r("железо", "gpus?|tpus?|npu|asic|hbm|h100|h200|b200|blackwell|видеокарт~|ускорител~|accelerator~|flops|teraflops", 2),
        r("фреймворки", "pytorch|jax|tensorflow|keras|hugging_?face|transformers library|deepspeed|megatron|fsdp", 2),
        r("код", "github|implementation|реализаци~|source code|исходн~ код~|repo|репозитори~|compiler|компилятор~", 2),
        r("оптимизация", "optimiz~|оптимизац~|оптимизир~|speedup|ускорени~|memory_efficient|эффективн~", 2),
        r("системное ПО", "postgres~|sqlite|database~|баз~ данных|linux|kernel|filesystem|file system|wasm|webassembly|concurrency|async|distributed|protocol|cve|vulnerabilit~|уязвимост~|exploit~|performance|производительност~|faster|быстрее|benchmarks?", 2),
        r("туториал", "tutorial|guide|туториал~|руководств~|пошагов~|step_by_step|cookbook|how to", 2),
        r("параметры модели", "\\d+(?:\\.\\d+)?[bmk]|\\d+(?:\\.\\d+)? ?(?:млрд|billion) (?:параметр~|parameters)|parameters|параметр~", 2),
        r("агенты/инструменты", "tool use|tool calling|function calling|mcp|agentic|agent framework|агентн~", 2),
        r("безопасность моделей (тех.)", "jailbreak~|prompt injection|red_team~|adversarial|джейлбрейк~|uncertainty|calibration", 2),
        r("эксперименты", "experiment~|эксперимент~|results show|we propose|we introduce|мы предлагаем|метрик~|accuracy|точност~", 2),

        // Слабые: тема та же, но сами по себе мало говорят
        r("LLM", "llms?|language models?|языков~ модел~|gpt_?\\d~|claude|gemini|llama|qwen|mistral|deepseek|phi_?\\d", 1),
        r("модель/обучение", "models?|модел~|training|обучени~|neural|нейросет~|нейрон~|network~", 1),
        r("алгоритмы", "algorithm~|алгоритм~|math~|математ~|theorem|proof|доказательств~|statistic~", 1),
        r("разработка", "api|sdk|library|библиотек~|framework|фреймворк~|python|rust|c\\+\\+|open model~", 1),
        r("релиз", "release[sd]?|introducing|announcing|launch~|релиз~|представил~|выпустил~|вышл~|вышел", 1),
        r("компьютерное зрение", "computer vision|segmentation|object detection|сегментаци~|детекци~|компьютерн~ зрени~", 2),
        r("робототехника", "robot~|робот~|embodied|manipulation|locomotion", 1),
    )

    // ---------------- Отрицательные признаки ----------------
    private val negative = listOf(
        // «Глава компании заявил / предупредил» — главный источник шума
        r(
            "цитата руководителя",
            "(?:ceo|founder|chief|boss|executive~|altman|musk|zuckerberg|pichai|nadella|huang|amodei|hassabis|suleyman|глав~|гендиректор~|основател~|руководител~|альтман~|маск~|цукерберг~)" +
                "(?:\\W+\\p{L}+){0,4}\\W+(?:says?|said|warns?|warned|claims?|predicts?|believes?|thinks?|admits?|reveals?|told|заявил~|предупредил~|предупреждает|считает|уверен~|признал~|рассказал~|назвал~|пообещал~)",
            -6,
        ),
        r("персоны", "ceo|altman|musk|zuckerberg|pichai|nadella|jensen huang|гендиректор~|альтман~|маск~|цукерберг~|миллиардер~|billionaire", -1),
        r("говорение", "says|said|warns?|warned|claims?|predicts?|interview|podcast|op_ed|opinion|keynote|заявил~|заявлени~|предупредил~|предупреждает|интервью|подкаст~|мнени~", -2),

        // Страшилки и апокалипсис
        r(
            "страшилки",
            "existential|doom~|apocalyp~|extinction|wipe out|end of humanity|take over the world|takeover|skynet|terminator|rogue ai|superintelligence will|godfather of ai|" +
                "апокалипс~|конец человечеств~|уничтож~ человечеств~|захват~ (?:мир~|власт~|планет~)|восстани~ машин|поработ~|крестн~ отец ии|сверхразум~",
            -5,
        ),
        r("«опасный ИИ»", "danger~|threat~|fear~|scary|terrifying|frightening|alarm~|опасн~|угроз~|страх~|пугающ~|тревожн~|ужас~", -3),
        r(
            "заменит людей",
            "replace (?:all )?(?:jobs|humans|workers|programmers|developers)|will replace|jobs? (?:crisis|apocalypse|loss|losses)|out of work|unemploy~|" +
                "замен~ (?:люд~|человек~|программист~|разработчик~|работник~)|остав~ без работы|лиш~ работы|безработиц~|вытесн~|професси~ (?:исчезн~|будущ~)|исчезн~ професси~",
            -4,
        ),
        r("кликбейт", "shocking|you won.?t believe|mind_blowing|insane|jaw_dropping|шок~|сенсаци~|невероятн~|взорвал~ интернет", -3),
        r("сознание/чувства ИИ", "sentient|conscious~|self_aware|осознал~|разумн~ ли|чувств~ ли|обрел~ сознани~", -3),

        // Бизнес и рынки
        r(
            "деньги/рынок",
            "stocks?|shares|valuation|ipo|funding|raises? \\$|\\$\\s?\\d+(?:\\.\\d+)?\\s?(?:billion|million|bn|b|m|trillion)|investors?|investment~|acquisition|acquires?|merger|revenue|earnings|market cap|bubble|" +
                "акци[яий]|акциям~|инвестици~|инвестор~|миллиард~ долл~|оценк~ (?:компани~|стартап~|в \\$)|сделк~|выручк~|капитализаци~|пузыр~|раунд~ финансирован~",
            -3,
        ),
        r("продажи/скидки", "deal|deals|discount|black friday|sale|price cut|скидк~|распродаж~|подешевел~", -2),

        // Политика и суды
        r(
            "политика/суд",
            "lawsuit|sues?|sued|court|copyright|regulat~|senat~|congress|lawmakers?|white house|ai act|government|trump|biden|election|sanction~|ban(?:s|ned)?|" +
                "суд|суда|судом|иск|иска|иском|иски|закон|законопроект~|регулировани~|регулятор~|депутат~|госдум~|правительств~|санкци~|запрет~|выбор~ президент~",
            -3,
        ),
        r("драма/кадры", "fired|ousted|resign~|steps down|drama|feud|slams|blasts|backlash|controversy|layoffs|laying off|lays off|job cuts|poach~|сокращ~ сотрудник~|уволен~|увольнени~|отставк~|скандал~|конфликт~|разнес~", -2),
        r("потребительские гаджеты", "iphone|galaxy s\\d+|smartwatch|airpods|unboxing|распаковк~|смартфон~", -1),
    )

    // ---------------- Домены ссылок ----------------
    private val domainBonus = mapOf(
        "arxiv.org" to 4, "openreview.net" to 4, "aclanthology.org" to 4, "proceedings.mlr.press" to 4,
        "proceedings.neurips.cc" to 4, "github.com" to 3, "huggingface.co" to 3, "distill.pub" to 3,
        "paperswithcode.com" to 3, "pytorch.org" to 2, "github.io" to 1, "research.google" to 2,
        "deepmind.google" to 1, "developer.nvidia.com" to 1,
    )
    private val domainPenalty = mapOf(
        "cnbc.com" to -3, "bloomberg.com" to -2, "businessinsider.com" to -3, "fortune.com" to -3,
        "forbes.com" to -3, "foxnews.com" to -4, "nypost.com" to -4, "dailymail.co.uk" to -4,
        "futurism.com" to -3, "wsj.com" to -2, "ft.com" to -2, "cnn.com" to -3, "axios.com" to -2,
        "theverge.com" to -1, "yahoo.com" to -2, "newsweek.com" to -4, "independent.co.uk" to -3,
        "rbc.ru" to -2, "ria.ru" to -3, "lenta.ru" to -3, "tass.ru" to -3,
    )

    // ---------------- Теги тем ----------------
    private val topicTags = listOf(
        "LLM" to "llms?|language models?|языков~ модел~|gpt_?\\d~|claude|gemini|llama|qwen|mistral|deepseek",
        "Агенты" to "agents?|agentic|tool use|tool calling|mcp|агент~",
        "Статья" to "arxiv|paper|preprint|technical report|openreview|статья на arxiv",
        "Зрение" to "computer vision|image~|video~|segmentation|vlm|vision_language|изображени~|видео|компьютерн~ зрени~",
        "Аудио" to "speech|audio|tts|asr|voice|речь|речи|голос~|аудио",
        "RL" to "reinforcement learning|rlhf|rlvr|grpo|ppo|dpo|reward model~|обучени~ с подкреплением",
        "Железо" to "gpus?|tpus?|cuda|triton|chips?|hardware|asic|hbm|h100|b200|blackwell|видеокарт~|чип~|ускорител~",
        "Open source" to "open_source~|open_weights?|github|опенсорс~|открыт~ (?:вес~|код~)",
        "Инференс" to "inference|инференс~|quantiz~|квантиз~|kv_cache|speculative decoding|vllm|llama\\.cpp|gguf",
        "Обучение" to "fine_tun~|pre_?train~|post_?train~|training|дообучени~|обучени~ модел~|distill~|lora",
        "Код" to "coding|code generation|copilot|swe_bench|compiler|programming|программировани~|генераци~ код~",
        "Роботы" to "robot~|робот~|embodied",
        "Интерпретируемость" to "interpretab~|mechanistic|sparse autoencoder~|интерпретируем~",
    ).map { (tag, p) -> tag to Regex(expand(p), RegexOption.IGNORE_CASE) }

    private const val SUMMARY_POSITIVE_CAP = 6

    fun evaluate(
        title: String,
        summary: String,
        url: String,
        sourceTrust: Int,
        settings: AppSettings,
    ): Verdict {
        val signals = mutableListOf<Signal>()
        val desc = summary.take(1500)

        if (sourceTrust != 0) signals += Signal("доверие к источнику", sourceTrust)

        var summaryPositive = 0
        for (rule in positive) {
            when {
                rule.regex.containsMatchIn(title) -> signals += Signal("${rule.label} (заголовок)", rule.weight + 1)
                summaryPositive < SUMMARY_POSITIVE_CAP && rule.regex.containsMatchIn(desc) -> {
                    val w = minOf(rule.weight, SUMMARY_POSITIVE_CAP - summaryPositive)
                    summaryPositive += w
                    signals += Signal("${rule.label} (описание)", w)
                }
            }
        }

        for (rule in negative) {
            when {
                rule.regex.containsMatchIn(title) -> signals += Signal("${rule.label} (заголовок)", rule.weight)
                rule.regex.containsMatchIn(desc) -> signals += Signal("${rule.label} (описание)", minOf(-1, rule.weight / 2))
            }
        }

        val host = hostOf(url)
        if (host != null) {
            domainBonus.entries.firstOrNull { host == it.key || host.endsWith("." + it.key) }
                ?.let { signals += Signal("ссылка на ${it.key}", it.value) }
            domainPenalty.entries.firstOrNull { host == it.key || host.endsWith("." + it.key) }
                ?.let { signals += Signal("бизнес/желтое СМИ: ${it.key}", it.value) }
        }

        val text = "$title\n$desc"
        for (w in settings.allowWords) {
            if (w.isNotBlank() && text.contains(w.trim(), ignoreCase = true)) signals += Signal("ваше слово «${w.trim()}»", 4)
        }
        for (w in settings.blockWords) {
            if (w.isNotBlank() && text.contains(w.trim(), ignoreCase = true)) signals += Signal("стоп-слово «${w.trim()}»", -8)
        }

        val score = signals.sumOf { it.weight }
        val tags = topicTags.filter { (_, re) -> re.containsMatchIn(title) || re.containsMatchIn(desc) }
            .map { it.first }
            .take(4)

        return Verdict(
            score = score,
            passed = score >= settings.strictness,
            tags = tags,
            signals = signals.sortedByDescending { kotlin.math.abs(it.weight) },
        )
    }

    fun hostOf(url: String): String? {
        val m = Regex("^[a-zA-Z][a-zA-Z0-9+.-]*://([^/?#:]+)").find(url) ?: return null
        return m.groupValues[1].lowercase().removePrefix("www.")
    }
}

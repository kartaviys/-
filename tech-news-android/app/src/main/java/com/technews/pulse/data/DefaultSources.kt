package com.technews.pulse.data

import com.technews.pulse.data.Category.COMMUNITY
import com.technews.pulse.data.Category.ENGINEERING
import com.technews.pulse.data.Category.RESEARCH
import com.technews.pulse.data.Category.RU
import com.technews.pulse.data.Category.TECH

private const val HN = "https://hn.algolia.com/api/v1"

/**
 * Источники по умолчанию. Упор на первоисточники: исследовательские блоги,
 * инженерные блоги, технические авторы. Агрегаторы (HN, Reddit, Хабр) проходят
 * через фильтр, который отсекает хайп и «говорящие головы».
 */
val DEFAULT_SOURCES: List<Source> = listOf(
    // --- Исследования ---
    Source("deepmind", "Google DeepMind", "https://deepmind.google/blog/rss.xml", RESEARCH, trust = 2),
    Source("google_research", "Google Research", "https://research.google/blog/rss/", RESEARCH, trust = 2),
    Source("msr", "Microsoft Research", "https://www.microsoft.com/en-us/research/feed/", RESEARCH, trust = 1),
    Source("bair", "Berkeley AI Research", "https://bair.berkeley.edu/blog/feed.xml", RESEARCH, trust = 3),
    Source("hf_blog", "Hugging Face", "https://huggingface.co/blog/feed.xml", RESEARCH, trust = 2),
    Source("openai", "OpenAI", "https://openai.com/news/rss.xml", RESEARCH, trust = 0),
    Source("lilianweng", "Lil'Log (Lilian Weng)", "https://lilianweng.github.io/index.xml", RESEARCH, trust = 3),
    Source("gradient", "The Gradient", "https://thegradient.pub/rss/", RESEARCH, trust = 2),
    Source(
        "hn_arxiv", "arXiv-статьи, обсуждаемые на HN",
        "$HN/search_by_date?query=arxiv.org&restrictSearchableAttributes=url&tags=story&numericFilters=points%3E15&hitsPerPage=40",
        RESEARCH, type = SourceType.HN_ALGOLIA, trust = 2,
    ),
    Source("arxiv_cl", "arXiv cs.CL (поток)", "https://rss.arxiv.org/rss/cs.CL", RESEARCH, trust = 2, enabled = false, maxItems = 30),
    Source("arxiv_lg", "arXiv cs.LG (поток)", "https://rss.arxiv.org/rss/cs.LG", RESEARCH, trust = 2, enabled = false, maxItems = 30),
    Source("arxiv_ai", "arXiv cs.AI (поток)", "https://rss.arxiv.org/rss/cs.AI", RESEARCH, trust = 2, enabled = false, maxItems = 30),

    // --- Инженерия / практика ---
    Source("nvidia_dev", "NVIDIA Technical Blog", "https://developer.nvidia.com/blog/feed", ENGINEERING, trust = 1),
    Source("aws_ml", "AWS Machine Learning Blog", "https://aws.amazon.com/blogs/machine-learning/feed/", ENGINEERING, trust = 0),
    Source("simonw", "Simon Willison", "https://simonwillison.net/atom/everything/", ENGINEERING, trust = 1),
    Source("raschka", "Sebastian Raschka", "https://magazine.sebastianraschka.com/feed", ENGINEERING, trust = 3),
    Source("interconnects", "Interconnects (N. Lambert)", "https://www.interconnects.ai/feed", ENGINEERING, trust = 1),
    Source("huyenchip", "Chip Huyen", "https://huyenchip.com/feed.xml", ENGINEERING, trust = 2),
    Source("eugeneyan", "Eugene Yan", "https://eugeneyan.com/rss/", ENGINEERING, trust = 2),

    // --- Сообщество (фильтруется строже всего) ---
    Source(
        "hn_llm", "Hacker News: LLM",
        "$HN/search_by_date?query=LLM&tags=story&numericFilters=points%3E40&hitsPerPage=40",
        COMMUNITY, type = SourceType.HN_ALGOLIA,
    ),
    Source(
        "hn_front", "Hacker News: главная",
        "$HN/search?tags=front_page&hitsPerPage=60",
        COMMUNITY, type = SourceType.HN_ALGOLIA,
    ),
    Source("lobsters_ai", "Lobsters: ai", "https://lobste.rs/t/ai.rss", COMMUNITY, trust = 1),
    Source("r_ml", "r/MachineLearning (топ дня)", "https://www.reddit.com/r/MachineLearning/top/.rss?t=day", COMMUNITY),
    Source("r_localllama", "r/LocalLLaMA (топ дня)", "https://www.reddit.com/r/LocalLLaMA/top/.rss?t=day", COMMUNITY),

    // --- Технологии в целом ---
    Source("meta_eng", "Engineering at Meta", "https://engineering.fb.com/feed/", TECH, trust = 1),
    Source("cloudflare", "Cloudflare Blog", "https://blog.cloudflare.com/rss/", TECH, trust = 1),
    Source("ars", "Ars Technica", "https://feeds.arstechnica.com/arstechnica/technology-lab", TECH, trust = -1, enabled = false),

    // --- На русском ---
    Source("habr_ai", "Хабр: Искусственный интеллект", "https://habr.com/ru/rss/hub/artificial_intelligence/all/?fl=ru", RU),
    Source("habr_ml", "Хабр: Машинное обучение", "https://habr.com/ru/rss/hub/machine_learning/all/?fl=ru", RU, trust = 1),
)

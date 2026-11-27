import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import matplotlib.ticker as mticker
import pandas as pd
import numpy as np
import os
import re
from datetime import timedelta


# ============================================================================
# КОНФИГ
# ============================================================================

# Конкуренты, которых анализируем на инсайды
COMPETITORS = [
    ('Пульс (остатки пульса)',               'Пульс',        'blue'),
    ('Протек (остатки протека)',              'Протек',       'orange'),
    ('Катрен (остатки катрена)',              'Катрен',       'red'),
    ('Фармкомплект (остатки фармкомплекта)',  'ФармКомплект', 'purple'),
]

# ГК — наш дистрибьютор (не конкурент)
GK_COL = 'ГК (остатки гранд капитала)'

# Колонки конкурентов для анализа инсайдов
OTHER_COLS = [col for col, _, _ in COMPETITORS]

COL_TO_SHORT = {col: short for col, short, _ in COMPETITORS}
SHORT_TO_COL = {v: k for k, v in COL_TO_SHORT.items()}

# Все колонки остатков (включая ГК) — для графиков
ALL_COMPETITORS_FOR_CHART = [
    ('Пульс (остатки пульса)',               'Пульс',        'blue'),
    ('Протек (остатки протека)',              'Протек',       'orange'),
    ('Катрен (остатки катрена)',              'Катрен',       'red'),
    ('ГК (остатки гранд капитала)',           'ГК',           'green'),
    ('Фармкомплект (остатки фармкомплекта)',  'ФармКомплект', 'purple'),
]

PERIOD_START = pd.Timestamp('2025-12-01')
PERIOD_END   = pd.Timestamp('2026-02-28')
WIDE_START   = pd.Timestamp('2025-11-01')

NY_START = pd.Timestamp('2025-12-30')
NY_END   = pd.Timestamp('2026-01-09')

# --- Пороги детекции ---
SHIPMENT_THRESHOLD   = 2.0
STOCK_GROWTH_PCT     = 0.25
NEAR_ZERO_PCT        = 0.10
MARKET_GROWTH_MIN    = 0.10
LEADER_RATIO_MIN     = 0.15
ZERO_STREAK_DAYS     = 10
INSIDER_WINDOW_DAYS  = 14        # 2 недели до повышения цен

# --- Серая зона на графиках ---
GRAY_BEFORE_WEEKS = 3
GRAY_AFTER_WEEKS  = 2


# ============================================================================
# ПОДГОТОВКА ДАННЫХ
# ============================================================================

def _is_valid_day(date):
    return date.weekday() < 5


def _prepare_competitors(df_comp, sku, date_col='Дата', prod_col='Код товара',
                         start=None, end=None):
    start = start or PERIOD_START
    end   = end   or PERIOD_END

    df = df_comp.copy()
    df[date_col] = pd.to_datetime(df[date_col])
    df = df[(df[prod_col] == sku) & (df[date_col] >= start) & (df[date_col] <= end)]

    full = pd.DataFrame({date_col: pd.date_range(start, end, freq='D')})
    full[prod_col] = sku
    full = full.merge(df, on=[date_col, prod_col], how='left')

    all_stock_cols = [c for c in OTHER_COLS + [GK_COL] if c in full.columns]

    # НГ каникулы: 0 и NaN → последнее значение до каникул
    ny_mask = (full[date_col] >= NY_START) & (full[date_col] <= NY_END)
    pre_ny  = full[full[date_col] < NY_START]
    for col in all_stock_cols:
        if pre_ny.empty:
            continue
        pre_vals = pre_ny[pre_ny[col].notna() & (pre_ny[col] > 0)][col]
        if pre_vals.empty:
            pre_vals = pre_ny[pre_ny[col].notna()][col]
        last_val = pre_vals.iloc[-1] if not pre_vals.empty else None
        if last_val is not None:
            for i in full[ny_mask].index:
                val = full.at[i, col]
                if pd.isna(val) or val == 0:
                    full.at[i, col] = last_val

    # Обычный ffill
    for col in all_stock_cols:
        full[col] = full[col].ffill()
        for i in range(len(full)):
            if pd.isna(full.at[i, col]):
                j = i - 1
                while j >= 0:
                    if pd.notna(full.at[j, col]):
                        full.at[i, col] = full.at[j, col]
                        break
                    j -= 1

    full = full[full[date_col].apply(_is_valid_day)].reset_index(drop=True)
    return full


def _get_name(df_competitors, sku, prod_col='Код товара', name_col='Наименование у нас'):
    rows = df_competitors[df_competitors[prod_col] == sku]
    if rows.empty or name_col not in rows.columns:
        return ''
    val = rows[name_col].dropna()
    return val.iloc[0] if not val.empty else ''


def _compute_avg_shipment(comp_full, date_col, val_col):
    df = comp_full[[date_col, val_col]].dropna().sort_values(date_col)
    df = df[df[date_col].apply(_is_valid_day)]
    if len(df) < 2:
        return 0, 0
    df = df.copy()
    avg_stock = df[val_col].mean()
    df['delta'] = df[val_col].diff()
    increases = df[df['delta'] > 0]['delta']
    if increases.empty:
        return 0, avg_stock
    return increases.mean(), avg_stock


# ============================================================================
# ДЕТЕКЦИЯ ИНСАЙДОВ
# ============================================================================

def _has_significant_growth(window_df, date_col, val_col,
                            avg_shipment, avg_stock,
                            avg_market_stock, full_comp):
    if avg_shipment == 0 and avg_stock == 0:
        return False

    df = window_df[[date_col, val_col]].dropna().sort_values(date_col)
    df = df[df[date_col].apply(_is_valid_day)]
    if len(df) < 2:
        return False

    df = df.copy()
    df['delta'] = df[val_col].diff()

    threshold_own = max(
        SHIPMENT_THRESHOLD * avg_shipment if avg_shipment > 0 else 0,
        STOCK_GROWTH_PCT * avg_stock      if avg_stock > 0    else 0,
    )
    threshold_market = MARKET_GROWTH_MIN * avg_market_stock if avg_market_stock > 0 else 0
    threshold_val = max(threshold_own, threshold_market)
    if threshold_val == 0:
        return False

    full_ts = full_comp[[date_col, val_col]].dropna().sort_values(date_col)
    full_ts = full_ts[full_ts[date_col].apply(_is_valid_day)].reset_index(drop=True)

    def _is_defectura(pre_stock, post_stock, jump_dt):
        if avg_stock <= 0 or pre_stock >= NEAR_ZERO_PCT * avg_stock:
            return False
        if avg_market_stock > 0 and post_stock >= LEADER_RATIO_MIN * avg_market_stock:
            return False
        before = full_ts[full_ts[date_col] < jump_dt].sort_values(date_col, ascending=False)
        zero_streak = 0
        near_zero_abs = max(NEAR_ZERO_PCT * avg_stock, 1)
        for _, brow in before.iterrows():
            if brow[val_col] <= near_zero_abs:
                zero_streak += 1
            else:
                break
        return zero_streak >= ZERO_STREAK_DAYS

    # Проверка 1: разовые скачки
    for _, row in df[df['delta'] > 0].iterrows():
        prev_stock = row[val_col] - row['delta']
        if _is_defectura(prev_stock, row[val_col], row[date_col]):
            continue
        if row['delta'] > threshold_val:
            return True

    # Проверка 2: кумулятивный рост
    min_val = df[val_col].min()
    max_val = df[val_col].max()
    if max_val - min_val > threshold_val:
        min_idx = df[val_col].idxmin()
        max_idx = df[val_col].idxmax()
        if df.loc[max_idx, date_col] >= df.loc[min_idx, date_col]:
            if not _is_defectura(min_val, max_val, df.loc[min_idx, date_col]):
                return True

    return False


def _detect_insiders(comp, price_dates):
    date_col = 'Дата'

    avg_data = {}
    for col in OTHER_COLS:
        if col in comp.columns:
            avg_data[col] = _compute_avg_shipment(comp, date_col, col)

    all_cols = [c for c in OTHER_COLS + [GK_COL] if c in comp.columns]
    avg_market_stock = 0
    if all_cols:
        comp_valid = comp[comp[date_col].apply(_is_valid_day)]
        avg_market_stock = comp_valid[all_cols].sum(axis=1).mean()

    suspicious = set()
    for pd_date in price_dates:
        w_start = pd_date - timedelta(days=INSIDER_WINDOW_DAYS)
        w_end   = pd_date
        window  = comp[(comp[date_col] >= w_start) & (comp[date_col] <= w_end)]

        # Считаем рост каждого конкурента в окне (в %)
        growth_pct = {}
        grew_significantly = set()
        for col in OTHER_COLS:
            if col not in window.columns:
                continue
            vals = window[col].dropna()
            if vals.empty or len(vals) < 2:
                growth_pct[col] = 0.0
                continue
            v_start = vals.iloc[0]
            v_end   = vals.iloc[-1]
            base = max(v_start, 1)  # избегаем деления на 0
            growth_pct[col] = (v_end - v_start) / base

            avg_ship, avg_stk = avg_data.get(col, (0, 0))
            if _has_significant_growth(window, date_col, col,
                                       avg_ship, avg_stk,
                                       avg_market_stock, comp):
                grew_significantly.add(col)

        if not grew_significantly:
            continue

        # Инсайд = конкурент вырос значимо, а остальные НЕТ
        # Медианный рост остальных (кроме проверяемого)
        for col in grew_significantly:
            others_growth = [g for c, g in growth_pct.items() if c != col]
            median_others = float(np.median(others_growth)) if others_growth else 0.0
            col_growth = growth_pct.get(col, 0.0)
            # Подозрительно, если рост конкурента заметно выше медианы остальных
            if col_growth > median_others + 0.25:
                suspicious.add(col)

    # Фильтр: остаток подозрительного < 15% лидера → не инсайд
    if suspicious and price_dates:
        filtered = set()
        for pd_date in price_dates:
            diffs = (comp[date_col] - pd_date).abs()
            row = comp.loc[diffs.idxmin()]
            all_check = [c for c in OTHER_COLS + [GK_COL] if c in comp.columns]
            leader_stock = max(row.get(c, 0) or 0 for c in all_check) if all_check else 0
            if leader_stock == 0:
                filtered = suspicious
                break
            for col in suspicious:
                val = row.get(col, 0) or 0
                if val >= LEADER_RATIO_MIN * leader_stock:
                    filtered.add(col)
        suspicious = filtered

    return [COL_TO_SHORT[c] for c in suspicious if c in COL_TO_SHORT]


def _gk_covers(comp, price_dates, suspicious_names):
    if not suspicious_names or GK_COL not in comp.columns:
        return False

    date_col = 'Дата'
    for pd_date in price_dates:
        before = comp[comp[date_col] <= pd_date]
        if before.empty:
            continue
        row = before.iloc[-1]
        gk_val = row.get(GK_COL)
        if pd.isna(gk_val) or gk_val == 0:
            continue
        comp_vals = []
        for name in suspicious_names:
            col = SHORT_TO_COL.get(name)
            if col and col in comp.columns:
                val = row.get(col)
                if pd.notna(val):
                    comp_vals.append(val)
        if not comp_vals:
            continue
        median_val = float(np.median(comp_vals))
        if gk_val >= median_val:
            return True
    return False


# ============================================================================
# КАТЕГОРИЗАЦИЯ
# ============================================================================

def _auto_category(comp, price_dates, price_series):
    if not price_dates:
        return 'Ошибка Авдеева'
    if comp.empty:
        return 'Без подозрений'

    insiders = _detect_insiders(comp, price_dates)
    if insiders:
        if _gk_covers(comp, price_dates, insiders):
            return 'Без подозрений'
        return 'Инсайд: ' + ', '.join(sorted(insiders))

    date_col = 'Дата'
    if GK_COL in comp.columns:
        avg_ship_gk, avg_stk_gk = _compute_avg_shipment(comp, date_col, GK_COL)
        for pd_date in price_dates:
            w_start = pd_date
            w_end   = pd_date + timedelta(days=INSIDER_WINDOW_DAYS)
            window  = comp[(comp[date_col] >= w_start) & (comp[date_col] <= w_end)]
            if _has_significant_growth(window, date_col, GK_COL,
                                       avg_ship_gk, avg_stk_gk,
                                       avg_market_stock=0, full_comp=comp):
                return 'С подозрением на ошибку'

    return 'Без подозрений'


# ============================================================================
# СМЕШАННАЯ ГРАНУЛЯРНОСТЬ
# ============================================================================

def _build_mixed_dates(all_workdays, gray_starts, gray_ends):
    result = []
    for d in all_workdays:
        in_gray = any(gs <= d <= ge for gs, ge in zip(gray_starts, gray_ends))
        if in_gray or d.weekday() == 0:
            result.append(d)
    return result


# ============================================================================
# ПОСТРОЕНИЕ ГРАФИКОВ (сохранение без показа)
# ============================================================================

def _build_chart(sku, drug_name, df_competitors, df_all_prices, df_svss,
                 category, insider_names):
    title_name = f'{drug_name}  |  {sku}' if drug_name else sku
    insider_label = ', '.join(sorted(insider_names))

    # --- Цены ---
    prices = df_all_prices[df_all_prices['PRODUCT'] == sku].copy()
    prices['DATE_FROM'] = pd.to_datetime(prices['DATE_FROM'], format='mixed', errors='coerce')
    prices['DATE_TO']   = pd.to_datetime(prices['DATE_TO'],   format='mixed', errors='coerce')
    prices = prices[
        (prices['DATE_FROM'] <= PERIOD_END) &
        (prices['DATE_TO']   >= PERIOD_START)
    ].sort_values('DATE_FROM')

    price_dates = prices[
        (prices['DATE_FROM'] >= PERIOD_START) &
        (prices['DATE_FROM'] <= PERIOD_END)
    ]['DATE_FROM'].tolist()

    gray_starts = [d - timedelta(weeks=GRAY_BEFORE_WEEKS) for d in price_dates]
    gray_ends   = [d + timedelta(weeks=GRAY_AFTER_WEEKS)  for d in price_dates]

    # --- Конкуренты (широкий диапазон) ---
    comp_wide = _prepare_competitors(df_competitors, sku, start=WIDE_START, end=PERIOD_END)
    stock_cols = [col for col, _, _ in ALL_COMPETITORS_FOR_CHART if col in comp_wide.columns]

    # --- Смешанные даты ---
    all_workdays = comp_wide['Дата'].tolist()
    mixed_dates = _build_mixed_dates(all_workdays, gray_starts, gray_ends)
    comp_mixed = comp_wide[comp_wide['Дата'].isin(mixed_dates)].reset_index(drop=True)
    n_points = len(comp_mixed)
    if n_points == 0:
        comp_mixed = comp_wide.copy()
        mixed_dates = all_workdays
        n_points = len(comp_mixed)

    x = np.arange(n_points)

    # --- PPRICE на те же даты ---
    price_full = pd.DataFrame({'Дата': pd.date_range(PERIOD_START, PERIOD_END, freq='D')})
    price_full['PPRICE'] = None
    for _, row in prices.iterrows():
        mask = (price_full['Дата'] >= row['DATE_FROM']) & (price_full['Дата'] <= row['DATE_TO'])
        price_full.loc[mask, 'PPRICE'] = row['PPRICE']
    price_full['PPRICE'] = pd.to_numeric(price_full['PPRICE'])

    price_full = price_full.set_index('Дата').reindex(
        pd.date_range(WIDE_START, PERIOD_END, freq='D')).rename_axis('Дата')
    price_full['PPRICE'] = price_full['PPRICE'].ffill().bfill()
    price_full = price_full.reset_index()

    pprice_vals = []
    for d in mixed_dates:
        m = price_full[price_full['Дата'] == d]
        pprice_vals.append(m.iloc[0]['PPRICE'] if not m.empty and pd.notna(m.iloc[0]['PPRICE']) else np.nan)

    # --- SVSS на те же даты ---
    svss_raw = df_svss[df_svss['Код товара'] == sku].copy()
    if not svss_raw.empty:
        svss_raw['Дата'] = pd.to_datetime(svss_raw['Дата'], errors='coerce')
        svss_raw = svss_raw.dropna(subset=['Дата']).sort_values('Дата')

    svss_vals = []
    for d in mixed_dates:
        m = svss_raw[svss_raw['Дата'] == d] if not svss_raw.empty else pd.DataFrame()
        svss_vals.append(m.iloc[0]['SVSS'] if not m.empty and 'SVSS' in m.columns else np.nan)

    # --- Индексы ключевых точек ---
    def idx_of(target):
        if not mixed_dates:
            return 0
        deltas = [abs((d - target).total_seconds()) for d in mixed_dates]
        return int(np.argmin(deltas))

    price_idx       = [idx_of(d) for d in price_dates]
    gray_idx_starts = [idx_of(gs) for gs in gray_starts]
    gray_idx_ends   = [idx_of(ge) for ge in gray_ends]

    # --- X-axis labels ---
    date_labels = [d.strftime('%d.%m') for d in mixed_dates]
    max_labels = 25
    step = max(1, n_points // max_labels)
    tick_pos = list(range(0, n_points, step))
    tick_lbl = [date_labels[i] for i in tick_pos]

    # --- Figure ---
    fig, (ax0, ax1, ax2, ax3) = plt.subplots(4, 1, figsize=(18, 22))

    fig.suptitle(f'{title_name}\n[Инсайд: {insider_label}]',
                 fontsize=13, fontweight='bold', y=0.995, color='#c0392b')

    def _setup(ax):
        ax.set_xlim(-0.5, n_points - 0.5)
        ax.set_xticks(tick_pos)
        ax.set_xticklabels(tick_lbl, fontsize=8)
        ax.grid(True, alpha=0.3)

    def _gray(ax):
        for i0, i1 in zip(gray_idx_starts, gray_idx_ends):
            ax.axvspan(i0 - 0.5, i1 + 0.5, alpha=0.10, color='gray', zorder=0)

    def _vl(ax):
        for k, pi in enumerate(price_idx):
            ax.axvline(pi, color='red', linestyle='--', linewidth=1.8, alpha=0.8,
                       label='Изм. цены' if k == 0 else None)

    # === ax0: Остатки ===
    if not comp_mixed.empty:
        for col, label, color in ALL_COMPETITORS_FOR_CHART:
            if col in comp_mixed.columns:
                v = comp_mixed[col].astype(float).values
                m = ~np.isnan(v)
                if m.any():
                    ax0.plot(x[m], v[m], marker='o', markersize=3,
                             linewidth=2, color=color, alpha=0.8, label=label)
    _gray(ax0); _vl(ax0)
    ax0.set_title('Остатки конкурентов — ноя 2025 — фев 2026', fontsize=12, fontweight='bold')
    ax0.set_ylabel('Остатки', fontsize=11)
    ax0.legend(loc='best', fontsize=9)
    _setup(ax0)

    # === ax1: Доля ===
    if not comp_mixed.empty and stock_cols:
        total = comp_mixed[stock_cols].sum(axis=1).replace(0, np.nan)
        for col, label, color in ALL_COMPETITORS_FOR_CHART:
            if col in comp_mixed.columns:
                s = comp_mixed[col].astype(float) / total * 100
                m = s.notna().values
                if m.any():
                    ax1.plot(x[m], s.values[m], marker='o', markersize=3,
                             linewidth=2, color=color, alpha=0.8, label=label)
        ax1.set_ylim(0, 105)
        ax1.yaxis.set_major_formatter(mticker.FuncFormatter(lambda y, _: f'{y:.0f}%'))
    _gray(ax1); _vl(ax1)
    ax1.set_title('Доля в суммарном стоке — ноя 2025 — фев 2026', fontsize=12, fontweight='bold')
    ax1.set_ylabel('Доля, %', fontsize=11)
    ax1.legend(loc='best', fontsize=9)
    _setup(ax1)

    # === ax2: PPRICE ===
    pp = np.array(pprice_vals, dtype=float)
    hp = ~np.isnan(pp)
    if hp.any():
        ax2.step(x[hp], pp[hp], where='post', color='darkred', linewidth=2.5, label='PPRICE')
        for pi in price_idx:
            if 0 <= pi < len(pp) and not np.isnan(pp[pi]):
                ax2.scatter(pi, pp[pi], color='red', zorder=5, s=60)
                ax2.annotate(f"{pp[pi]:.2f} ₽", xy=(pi, pp[pi]),
                             xytext=(6, 6), textcoords='offset points',
                             fontsize=8, color='darkred')
    else:
        ax2.text(0.5, 0.5, 'Нет данных цен', transform=ax2.transAxes, ha='center', fontsize=12, color='gray')
    _gray(ax2); _vl(ax2)
    ax2.set_title('Цена прайса (PPRICE)', fontsize=12, fontweight='bold')
    ax2.set_ylabel('Цена, руб.', fontsize=11)
    ax2.legend(loc='best', fontsize=9)
    _setup(ax2)

    # === ax3: SVSS ===
    sv = np.array(svss_vals, dtype=float)
    hs = ~np.isnan(sv)
    if hs.any():
        ax3.plot(x[hs], sv[hs], color='steelblue', linewidth=2, marker='o', markersize=3, label='SVSS')
    else:
        ax3.text(0.5, 0.5, 'Нет данных SVSS', transform=ax3.transAxes, ha='center', fontsize=12, color='gray')
    _gray(ax3); _vl(ax3)
    ax3.set_title('SVSS', fontsize=12, fontweight='bold')
    ax3.set_ylabel('SVSS, руб.', fontsize=11)
    ax3.legend(loc='best', fontsize=9)
    _setup(ax3)

    plt.subplots_adjust(left=0.07, right=0.97, top=0.96, bottom=0.03, hspace=0.38)
    return fig


# ============================================================================
# ФИЛЬТРАЦИЯ
# ============================================================================

def _filter_codes(product_codes, df_competitors,
                  date_col='Дата', prod_col='Код товара'):
    df = df_competitors.copy()
    df[date_col] = pd.to_datetime(df[date_col])
    df = df[
        (df[prod_col].isin(product_codes)) &
        (df[date_col] >= PERIOD_START) &
        (df[date_col] <= PERIOD_END)
    ]

    passed = []
    for sku in product_codes:
        sub = df[df[prod_col] == sku]
        if sub.empty:
            continue
        has_gk = GK_COL in sub.columns and sub[GK_COL].dropna().gt(0).any()
        if not has_gk:
            continue
        has_other = any(
            col in sub.columns and sub[col].dropna().gt(0).any()
            for col in OTHER_COLS
        )
        if has_other:
            passed.append(sku)
    return passed


# ============================================================================
# МАППИНГ SKU → ПРОИЗВОДИТЕЛЬ
# ============================================================================

def _build_sku_manufacturer_map(df_all_prices):
    """Строит словарь SKU → FULL_NAME (производитель) из df_all_prices."""
    df = df_all_prices[['PRODUCT', 'FULL_NAME']].drop_duplicates(subset='PRODUCT')
    return dict(zip(df['PRODUCT'], df['FULL_NAME']))


# ============================================================================
# ОСНОВНАЯ ФУНКЦИЯ
# ============================================================================

def run_analysis(product_codes, df_competitors, df_all_prices, df_svss,
                 output_dir='charts_output',
                 manufacturers=None):
    """
    Анализ конкурентов на инсайды.

    Параметры:
    ----------
    product_codes : list
        Коды товаров для анализа.
    df_competitors : DataFrame
        Данные остатков конкурентов.
    df_all_prices : DataFrame
        Данные цен (должен содержать FULL_NAME — производитель).
    df_svss : DataFrame
        Данные SVSS.
    output_dir : str
        Корневая директория для сохранения результатов.
    manufacturers : list или None
        Список производителей (FULL_NAME) для анализа.
        Если None — анализируются все.

    Результат:
    ----------
    DataFrame с колонками: SKU, Препарат, Производитель, Категория, Инсайдеры, График.
    Содержит ТОЛЬКО товары с обнаруженным инсайдом.
    Графики сохраняются в папки: output_dir/<Производитель>/
    """
    # Маппинг SKU → производитель
    sku_to_mfr = _build_sku_manufacturer_map(df_all_prices)

    # Фильтрация по производителям, если указаны
    product_codes = list(product_codes)
    if manufacturers:
        mfr_set = set(manufacturers)
        product_codes = [sku for sku in product_codes
                         if sku_to_mfr.get(sku) in mfr_set]
        print(f"Фильтрация по производителям ({len(manufacturers)}): "
              f"осталось {len(product_codes)} товаров")

    print("Фильтрация: ГК + хотя бы 1 другой конкурент...")
    filtered = _filter_codes(product_codes, df_competitors)
    print(f"До фильтра: {len(product_codes)}  →  После: {len(filtered)}\n")

    prices_all = df_all_prices.copy()
    prices_all['DATE_FROM'] = pd.to_datetime(prices_all['DATE_FROM'], format='mixed', errors='coerce')
    prices_all['DATE_TO']   = pd.to_datetime(prices_all['DATE_TO'],   format='mixed', errors='coerce')

    print("=" * 70)
    print(f"АВТОАНАЛИЗ: {len(filtered)} товаров  |  ноя 2025 — фев 2026")
    print(f"Окно детекции: {INSIDER_WINDOW_DAYS} дней до повышения цены")
    print("=" * 70)

    results = []
    insider_count = 0

    for idx, sku in enumerate(filtered, 1):
        drug_name = _get_name(df_competitors, sku)
        manufacturer = sku_to_mfr.get(sku, 'Неизвестный')
        comp = _prepare_competitors(df_competitors, sku)

        prices_sku = prices_all[prices_all['PRODUCT'] == sku]
        prices_sku = prices_sku[
            (prices_sku['DATE_FROM'] <= PERIOD_END) &
            (prices_sku['DATE_TO']   >= PERIOD_START)
        ].sort_values('DATE_FROM')

        price_series = pd.DataFrame({'Дата': pd.date_range(PERIOD_START, PERIOD_END, freq='D')})
        price_series['PPRICE'] = None
        for _, row in prices_sku.iterrows():
            mask = (price_series['Дата'] >= row['DATE_FROM']) & \
                   (price_series['Дата'] <= row['DATE_TO'])
            price_series.loc[mask, 'PPRICE'] = row['PPRICE']
        price_series['PPRICE'] = pd.to_numeric(price_series['PPRICE'])

        price_dates = prices_sku[
            (prices_sku['DATE_FROM'] >= PERIOD_START) &
            (prices_sku['DATE_FROM'] <= PERIOD_END)
        ]['DATE_FROM'].tolist()

        category = _auto_category(comp, price_dates, price_series)

        # Сохраняем только инсайды
        if not category.startswith('Инсайд'):
            if (idx % 100 == 0) or (idx == len(filtered)):
                print(f"  [{idx:>4}/{len(filtered)}] обработано, инсайдов: {insider_count}")
            continue

        insider_names = category.replace('Инсайд: ', '').split(', ')
        insider_count += 1

        # Сохранение графика в папку производителя
        safe_mfr = re.sub(r'[\\/*?:"<>|]', '-', manufacturer)[:60].strip()
        subdir = os.path.join(output_dir, safe_mfr)
        os.makedirs(subdir, exist_ok=True)

        safe_name = re.sub(r'[\\/*?:"<>|]', '-', drug_name)[:40].strip() if drug_name else ''
        fname = f"{sku}_{safe_name}.png" if safe_name else f"{sku}.png"
        fpath = os.path.join(subdir, fname)

        fig = _build_chart(sku, drug_name, df_competitors, df_all_prices,
                           df_svss, category, insider_names)
        fig.savefig(fpath, dpi=150, bbox_inches='tight')
        plt.close(fig)

        results.append({
            'SKU':            sku,
            'Препарат':       drug_name,
            'Производитель':  manufacturer,
            'Категория':      category,
            'Инсайдеры':      ', '.join(sorted(insider_names)),
            'График':         fpath,
        })

        print(f"  [{idx:>4}/{len(filtered)}]  {sku}  |  "
              f"{drug_name[:30] if drug_name else '—'}  |  "
              f"{manufacturer[:25]}  →  {category}")

    print("\n" + "=" * 70)

    df_res = pd.DataFrame(results)
    if df_res.empty:
        print("Инсайдов не обнаружено.")
        return df_res

    csv_path = os.path.join(output_dir, 'insiders.csv')
    os.makedirs(output_dir, exist_ok=True)
    df_res.to_csv(csv_path, index=False, encoding='utf-8-sig')

    print(f"\nОбнаружено инсайдов: {len(df_res)}")
    print(f"CSV: {csv_path}\n")

    # Статистика по конкурентам
    all_insiders = df_res['Инсайдеры'].str.split(', ').explode()
    print("По конкурентам:")
    print(all_insiders.value_counts().to_string())

    print("\nПо производителям (топ-15):")
    print(df_res['Производитель'].value_counts().head(15).to_string())

    return df_res

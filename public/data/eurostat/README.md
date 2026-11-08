# Сурови данни от Евростат

Само наборите, от които идват сериите в `public/data/charts.json`. Файловете са непроменени отговори на Евростат, а приложението не ги чете.

## [`gov_10dd_edpt1_jsonstat.json`](gov_10dd_edpt1_jsonstat.json)

Годишен държавен дефицит/излишък, дълг и свързани данни за държавите от ЕС и еврозоната. От него са сериите „Дефицит и излишък“ и „Държавен дълг“, като % от БВП и в милиони евро.

- **Набор:** `GOV_10DD_EDPT1`
- **Страница:** https://ec.europa.eu/eurostat/databrowser/view/GOV_10DD_EDPT1/default/table?lang=en
- **Обновен от Евростат:** 2026-10-21
- **Периоди с данни:** 1995 – 2025
- **Адрес:** `https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/gov_10dd_edpt1?format=JSON&lang=EN`

## [`gov_10q_ggdebt_jsonstat.json`](gov_10q_ggdebt_jsonstat.json)

Тримесечен държавен дълг за държавите от ЕС и еврозоната. От него е последната точка, 2026-Q2, на сериите „Държавен дълг“, като % от БВП и в милиони евро.

- **Набор:** `GOV_10Q_GGDEBT`
- **Страница:** https://ec.europa.eu/eurostat/databrowser/view/GOV_10Q_GGDEBT/default/table?lang=en
- **Обновен от Евростат:** 2026-10-21
- **Периоди с данни:** 1994-Q1 – 2026-Q2
- **Адрес:** `https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/gov_10q_ggdebt?format=JSON&lang=EN`

## [`nama_10_gdp_jsonstat.json`](nama_10_gdp_jsonstat.json)

Брутен вътрешен продукт по държави и мерни единици. От него са сериите „БВП“, в текущи цени и милиони евро. Запазен е само показателят `B1GQ`, защото целият набор е 18 MB.

- **Набор:** `NAMA_10_GDP`
- **Страница:** https://ec.europa.eu/eurostat/databrowser/view/NAMA_10_GDP/default/table?lang=en
- **Обновен от Евростат:** 2026-11-05
- **Периоди с данни:** 1975 – 2025
- **Адрес:** `https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/nama_10_gdp?format=JSON&lang=EN&na_item=B1GQ`

## [`prc_ppp_ind_1_jsonstat.json`](prc_ppp_ind_1_jsonstat.json)

Паритети на покупателната способност и индекси на реалния обем по държави и категории. От него са сериите „БВП на човек в СПС (ЕС-27 = 100)“, като индекс спрямо ЕС-27 = 100. Засега те са в `charts.json`, но не се показват на графиката.

- **Набор:** `PRC_PPP_IND_1`
- **Страница:** https://ec.europa.eu/eurostat/databrowser/view/PRC_PPP_IND_1/default/table?lang=en
- **Обновен от Евростат:** 2026-07-09
- **Периоди с данни:** 1995 – 2025
- **Адрес:** `https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/prc_ppp_ind_1?format=JSON&lang=EN`

## [`prc_hicp_minr_jsonstat.json`](prc_hicp_minr_jsonstat.json)

Месечен хармонизиран индекс на потребителските цени (ХИПЦ) по държави. От него са сериите „ХИПЦ“, като индекс 2025=100. Запазена е само общата категория `TOTAL`, защото целият набор е близо 400 MB.

- **Набор:** `PRC_HICP_MINR`
- **Страница:** https://ec.europa.eu/eurostat/databrowser/view/PRC_HICP_MINR/default/table?lang=en
- **Обновен от Евростат:** 2026-11-04
- **Периоди с данни:** 1996-01 – 2026-10
- **Адрес:** `https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/prc_hicp_minr?format=JSON&lang=EN&coicop18=TOTAL`

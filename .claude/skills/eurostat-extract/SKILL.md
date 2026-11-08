---
name: eurostat-extract
description: Turn a Eurostat JSON-stat export (files like public/data/eurostat/gov_10dd_edpt1_jsonstat.json) into series for public/data/charts.json, always over all years, with one proposal of indicators and options to approve and a final confirmation of every selected field before anything is generated or replaced. Use this whenever the user wants to extract, add, chart or refresh Eurostat data, pastes a link to ec.europa.eu/eurostat/databrowser, mentions a Eurostat dataset code (gov_10dd_edpt1, nama_10_gdp, prc_hicp_minr, ...), an indicator or unit code (B9, GD, B1GQ, PC_GDP, MIO_EUR, CP_MEUR), asks what an export contains or which options it has, or wants a new line on the chart from a figure such as дефицит, излишък, дълг, БВП or инфлация, even if they never say "JSON-stat".
---

# Eurostat extract

Turn a Eurostat JSON-stat export into series of `public/data/charts.json`. An indicator on the chart is one series per country: the 27 EU states and the euro area, 28 in all. Their `geo` codes are `AT BE BG CY CZ DE DK EE EL ES FI FR HR HU IE IT LT LU LV MT NL PL PT RO SE SI SK` and `EA21`.

These rules shape everything below:

- **Eurostat first.** Look for the data in every fitting Eurostat dataset, such as the quarterly `gov_10q_ggdebt` as well as the annual `gov_10dd_edpt1`. Use another source only for data Eurostat doesn't have, and say what is missing. This skill reads only Eurostat, so tell the user instead of copying figures by hand.
- **The dataset with the most years comes first.** When several datasets hold the same indicator, use the one with the most years for the selected countries, even if the user linked a shorter one, and say which dataset you passed over and how many years it has. Details are in "Finding the longest dataset" below.
- **Every year, always.** The script has no way to pick years and refuses a `time` selection. Don't trim the series afterwards, even for a request like "just the last ten years": extract all of it and say that you did. The one exception is adding a single newer point from another dataset, in "Adding the latest period" below.
- **One proposal, then one confirmation.** Options and indicators are the user's call, but they should see them once, together, and answer once. Don't walk them through a dimension at a time.
- **Never choose a field for the user.** If they name one field, such as the indicator, and another field still has several options, show those options and ask which they want. A recommendation may mark an option, but it doesn't count as their choice, and it never goes into the confirmation table. Only the year range and fields with a single code are settled without asking. All 28 geographies are the default, but ask if the request doesn't make the countries clear.
- **Nothing is generated or replaced unconfirmed.** Before any write, show every selected field with a brief description and wait for a yes (step 4). The user wants to see exactly what is about to happen, so this holds even when the request already named every code.

Run commands from the project root. The script is `.claude/skills/eurostat-extract/scripts/jsonstat.mjs`, called `$J` below. Quote paths in single quotes: export names can contain `$`.

## 1. Read the export

```bash
node $J inspect '<export.json>' --where geo=BG
```

This prints every dimension with its labels, then each combination that holds data with its units, periods and flags. Coverage differs by country, so inspect more than one, and use `EA21` to confirm the euro area is there.

If it prints the default-view warning, the file is cut to recent years and can't honour "every year". Say so and look for the full export in `public/data/eurostat/`. If there is none, tell the user, and with their agreement fetch it as described below. A warning from the script is not a reason to stop if the user knowingly wants that file.

### Finding the longest dataset

The more history a line has, the more it can show, so the first dataset found isn't enough. A link or code from the user may point to a short table, with a code such as `tec00127` or `tps00001`, which repeats a few recent years of a fuller dataset.

- Download the candidates to the scratchpad and run `inspect` on each. The export's `extension.annotation` entries can name the fuller dataset. If they don't, look through the datasets of the same topic.
- Compare the periods for the selected countries and options, not the span of the whole export, which can start years earlier than a country does.
- Check that the two datasets agree on the years they share. If they do, use the longer one and report it in the proposal. If they differ, they may not measure the same thing, so show both and let the user choose.
- A newer point from a shorter dataset can still be added to the longest series, as in "Adding the latest period" below.

Keep one raw file per dataset in `public/data/eurostat/`, named like the existing exports: `<dataset>_jsonstat.json`, such as `gov_10q_ggdebt_jsonstat.json`. Before calling the API, look for the file there and read it instead, so that another series from the same dataset needs no new download. If it isn't there, fetch it with `curl -A research-client` from `https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/<dataset>?format=JSON&lang=EN`, keeping all countries, and save the response unchanged. On a very large dataset filter a dimension other than `geo`, such as `na_item=B1GQ` or `coicop18=TOTAL`, and record the filter. Eurostat answers 413 on the larger ones until the file is ready, so retry after a minute.

Keep only the datasets that a series in `charts.json` uses, so that every figure on the chart can be traced to a file and nothing else piles up. A download used only for a check or a comparison goes in the scratchpad, not in the project.

Add each new file to `public/data/eurostat/README.md`, with a link to the file, a brief description in Bulgarian, the dataset code, its public page (`https://ec.europa.eu/eurostat/databrowser/view/<DATASET>/default/table?lang=en`, with the code in capitals), its update date, the periods it holds and the exact query. That page answers 200 even for a wrong code, so check that `https://doi.org/10.2908/<DATASET>` resolves. Leave out the number of values and the file size. To refresh a dataset, replace its file and update its entry.

## 2. Propose

Send one message holding the whole menu, then ask once. Fill in only what the user has chosen. For every other field with several options that hold data for their choice, list the options with a brief description and ask them to pick. Use `AskUserQuestion` when it fits, with one question per open field. Include:

- the combinations relevant to the request, as a table: indicator, sector, units, periods;
- what the user has selected so far, and the open fields among `geo`, `na_item`, `sector`, `unit` and any other dimension with several codes;
- the proposed metric `id` and Bulgarian name, and the existing entries in `charts.json` this would duplicate or replace;
- which of the 28 geographies have no data for the selection;
- where to write it. Ask this every run, since the user decides it case by case, and always as a choosable option through `AskUserQuestion`, never as a plain-text question. The options are `public/data/charts.json`, where the line appears on the chart, and a separate file, where the app stays unchanged. Ask it with the open fields of this step. If every other field is already chosen, ask it on its own before step 3;
- what the data can't do, when it applies: short coverage, gaps, flags, or a series ending earlier than others.

Each country is its own series. Its `id` is `<metric id>-<geo code in lower case>`, such as `deficit-surplus-bg` or `hicp-ea21`, and its `name` is `<показател> на <държава>`, such as „Дефицит и излишък на Австрия“.

Offer only combinations `inspect` shows. If the request is broad ("what can I chart?"), lead with the combinations that have the longest coverage. Several indicators are fine: list them all in one proposal and run step 3 for each.

Wait for their answer. If a field is still open afterwards, ask again about that field before moving on. Don't start step 3 until every field has been chosen. The answer settles the selection, but it isn't permission to write: that comes in step 4.

### Choosing a unit

`charts.json` states a series in `percent`, `EUR` or `index`. The chart compares countries, so money is always in euro.

| Unit | Output | Use |
|---|---|---|
| `PC_GDP` | `percent` | Comparing years or countries, since it removes the size of the economy |
| `MIO_EUR` | `EUR` | Amounts in euro |
| `CP_MEUR` | `EUR`, with `--chart-unit EUR --scale 1e6` | GDP in current prices |
| `I25`, `VI_PPS_EU27_2020_HAB` | `index`, with `--chart-unit index --scale 1` | Price indices, and GDP per capita against EU-27 = 100 |

Keep the unit the data is published in, because the goal is figures people can trust. If `charts.json` and the chart have no fitting unit, propose adding one, with its own value axis.

Never read `MIO_NAC` as euro from its name. The script compares it with `MIO_EUR` and refuses anything that isn't euro, such as złoty, so for a set of countries use `MIO_EUR` or `CP_MEUR`.

### Choosing a recommendation

When a field has several options, mark as recommended the one that combines the others into the figure for the whole country. It answers the question most people are asking, and the parts only make sense next to it. For `sector` that is `S13`, general government, because `S1311`, `S1312`, `S1313` and `S1314` add up to it. Where an indicator exists only under `S1`, such as `B1GQ`, that is the whole-country figure and there is nothing to choose. The same reasoning applies to other datasets: prefer the total over its breakdowns.

The recommendation is a marker, „(Препоръчително)“ on the option. The user still picks.

### Reading the codes

- `B9` is positive for a surplus and negative for a deficit.
- `S13` is general government, the headline figure. `S1311` central, `S1312` state, `S1313` local and `S1314` social security are its parts.
- `B1GQ` and `B5GQ` sit under `S1`, the total economy, not `S13`.
- `PC_GDP` of `B1GQ` is always 100: offer GDP in money.
- `GD` is a stock at the end of the period. Its change is net new debt, which is close to the deficit but not the same.
- `B9` is a flow, the total for the period, so a quarter can't be compared with a year.
- A `b` flag means a break in the series, so the change across that year may not be real. A `p` flag means provisional data. An `e` flag means an estimate.
- `PRC_HICP_MINR` is the current monthly HICP dataset, and its `coicop18=TOTAL` is the headline figure. Eurostat stopped updating `prc_hicp_manr`, `prc_hicp_midx` and `prc_hicp_aind` at the end of 2025, so they end there.
- HICP isn't the national CPI that the news usually quotes. The two are close but can differ, so say so when offering inflation.

### Adding the latest period

Annual datasets end a year or more behind the quarterly ones. To add a newer point to an annual series:

- Add it only if it means the same as the annual points. A stock such as `GD`, in money or as `PC_GDP`, qualifies. A flow such as `B9` doesn't, because three months on a line of twelve-month totals looks like a sudden improvement. It belongs in its own quarterly series, or stays out.
- Add only published values. A rolling twelve-month sum is a calculation, so offer it only with a clear label, and only if the user asks. `change` and `change_percent` are the exception, since every row has them, and they compare with the row before.
- Use the same selection as the series apart from `freq`, and say when the annual and quarterly figures differ for the same date.
- The script can't do this: it replaces a whole series from one export. Confirm with the table in step 4, with `Период` in place of `Години`, then append the row to `data`, add the dataset to `sources` with its `name` in `en` and `bg`, `dataset_id` and `url`, and format the file.
- Keep the raw file in `public/data/eurostat/`, because the chart now uses it.

The row carries its own origin, because the `dataset` block of the series describes only the annual dataset:

```json
{
  "date": "2026-06-30",
  "value": 45.2,
  "change": 0.4,
  "change_percent": 0.88,
  "dataset": { "id": "GOV_10Q_GGDEBT", "updated": "2026-10-21T11:00:00+0200", "period": "2026-Q2", "status": "p" }
}
```

## 3. Dry run

Run this once per country:

```bash
node $J extract 'public/data/eurostat/gov_10dd_edpt1_jsonstat.json' \
  --select freq=A,geo=AT,sector=S13,na_item=B9,unit=PC_GDP \
  --id deficit-surplus-at \
  --name "Дефицит и излишък на Австрия" \
  --into public/data/charts.json
```

Pin every dimension with more than one code, or the script lists what's still open. Without `--write` nothing changes. Read the output:

- `--into` a file that doesn't exist creates it as an array. One that does is merged by `id`.
- A new `id` adds an entry. An existing `id` replaces it, keeping its position, `shortName`, `meta` and every source it already cites.
- `UNIT CHANGES` or `REMOVED` means the replacement loses or redefines something. Say so in step 4.
- Rows with their own `dataset` field are lost on a replace, because they come from another export. If one shows under `REMOVED`, add it back after the write, unless the annual data now covers that date.
- `GAPS` rows have `change: 0`, since there is no adjacent period to compare with. Say so in step 4.

## 4. Confirm

Show the selected fields as a table, one row per field, using what the dry run printed. Include every dimension, also those with a single code such as `freq`, which the dry run lists on its second line. Write the table in Bulgarian, whatever language the conversation is in, and keep each description to a few words. Codes, ids and file paths stay as they are.

| Поле | Избрано | Описание |
|---|---|---|
| Държави | `geo=AT`, …, `EA21` | 27-те държави от ЕС и еврозоната |
| Показател | `na_item=B9` | Дефицит/излишък: положително е излишък, отрицателно е дефицит |
| Сектор | `sector=S13` | Сектор „Държавно управление“: цялата държава |
| Мерна единица | `unit=PC_GDP` | Процент от БВП |
| Честота | `freq=A` | Годишно |
| Години | всички, 1995–2025 | Брой години, плюс евентуални пропуски или отбелязани години |
| Идентификатор | `deficit-surplus-<код>` | Ключ на записа във файла |
| Име | „Дефицит и излишък на <държава>“ | Заглавие в графиката |
| Източник | Евростат, `GOV_10DD_EDPT1` | Цитат и избраните полета, добавени към записа |
| Файл | `public/data/charts.json` | Файлът, който ще бъде записан |
| Действие | добавяне или замяна | От пробното изпълнение: добавени, променени и премахнати редове и смяна на мерната единица |

Then ask directly whether to go ahead, and wait. With several indicators, show one table each, or one table with a column per indicator. If the user changes anything, rerun the dry run and show the table again. Run no `--write` and make no manual edit to the target until they confirm.

## 5. Write

To replace a series under a new `id`, first rename the old `id` in the target, so the merge keeps its position, `meta` and sources. Check first that nothing in `src/` relies on the old `id`.

Rerun the same commands with `--write`, then format and check the result:

```bash
npx --no-install prettier --write <target.json>
git diff --stat -- <target.json>
```

If `charts.json` was the target, the diff should touch only the series you meant to change.

A new indicator also has to be registered, or the chart won't offer it: add `{ id, name }` to `METRICS` in `src/app/services/chart/metrics.ts`, where `id` is the part of the series ids before the country code. A new country needs an entry in `COUNTRY_NAMES` in the same file.

## 6. Report

State the series written, their period range, the file, and anything the data couldn't do. Don't commit unless asked.

## What the output looks like

```json
{
  "id": "deficit-surplus-at",
  "name": "Дефицит и излишък на Австрия",
  "sources": [
    {
      "name": { "en": "… (Eurostat, % of GDP)", "bg": "… (Евростат, % от БВП)" },
      "dataset_id": "GOV_10DD_EDPT1",
      "url": ["https://ec.europa.eu/eurostat/databrowser/view/GOV_10DD_EDPT1/default/table?lang=en"]
    }
  ],
  "dataset": {
    "id": "GOV_10DD_EDPT1",
    "label": { "en": "Government deficit/surplus, debt and associated data", "bg": "Държавен дефицит/излишък, дълг и свързани данни" },
    "updated": "2026-10-21T11:00:00+0200",
    "selection": {
      "freq": { "code": "A", "label": { "en": "Annual", "bg": "Годишно" } },
      "unit": { "code": "PC_GDP", "label": { "en": "Percentage of gross domestic product (GDP)", "bg": "Процент от брутния вътрешен продукт (БВП)" } },
      "sector": { "code": "S13", "label": { "en": "General government", "bg": "Сектор „Държавно управление“" } },
      "na_item": { "code": "B9", "label": { "en": "Net lending (+)/net borrowing (-)", "bg": "Държавен дефицит/излишък (нетно кредитиране (+) / нетно заемане (-))" } },
      "geo": {
        "code": "AT",
        "label": { "en": "Austria", "bg": "Австрия" },
        "description": "Държавата или групата държави, за която са данните."
      }
    }
  },
  "unit": "percent",
  "data": [{ "date": "1995-12-31", "value": -6.2, "change": 0, "change_percent": 0 }]
}
```

- `dataset` records which dataset, release and options the series came from, so an entry can be traced and regenerated. Every dimension is listed, also those with a single code. The app doesn't read this field.
- Each label has `en` and `bg`. `en` is Eurostat's wording, copied unchanged from the export. `bg` comes from `references/labels-bg.json`, because exports hold no Bulgarian.
- Each selection item also has a `description` in Bulgarian only, saying what it is, from `references/descriptions.json`. Every item in the example has one, shortened here to `geo`. `geo` is explained once for the whole dimension, because a sentence per country would add nothing.
- If the script stops with `Missing text`, typically on a new dataset, add what it names to those files, using the established statistical term and a single plain sentence. Show the new text to the user in step 4, since it is going into the data.
- `value` is in base units, so millions are multiplied out. `percent` and `index` stay as published.
- A period is dated by its last day: `2025-12-31` for a year, `2026-06-30` for the second quarter, `2026-10-31` for a month.
- `change` is the difference from the previous period.
- `change_percent` is symmetric, `(new - old) / ((|new| + |old|) / 2) × 100`, because a plain percentage is meaningless when a deficit turns into a surplus. It runs from -200 to 200.

The script's tests are in `scripts/jsonstat.test.mjs`: `node --test .claude/skills/eurostat-extract/scripts/jsonstat.test.mjs`.

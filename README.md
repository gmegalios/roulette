# Roulette Winnings Tracker

A tiny roulette winnings tracker with no database. It saves entries as plain text in `data/winnings.txt`.

## Run locally

```bash
python3 app.py
```

Then open:

```text
http://127.0.0.1:1186
```

## Run on the Linux server

On `192.168.101.150`, clone the repo and start the app:

```bash
git clone <your-repo-url>
cd Roulette
python3 app.py
```

Then open:

```text
http://192.168.101.150:1186
```

You can change the host or port:

```bash
HOST=0.0.0.0 PORT=8080 python3 app.py
```

## Data

Entries are saved in:

```text
data/winnings.txt
```

## Features

- Add daily roulette wins or losses.
- See totals for all time, this month, and best day.
- Browse the chart by week with previous and next controls.
- Click any chart day to edit that day's total.
- Track the daily goal of `$20`.
- Get playful alerts for wins, losses, chart edits, and clear days.

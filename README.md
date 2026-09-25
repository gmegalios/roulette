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
- Browse the continuous profit line by week with previous and next controls.
- Switch between Week and Today chart tabs.
- Click a weekly chart point to zoom into that day.
- Click a day-chart point or history row edit button to update that timestamped entry.
- Track the daily goal of beating the previous day's winnings.
- Get playful alerts for wins, losses, chart edits, and clear days.

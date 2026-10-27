# Brew Pulse

What brewers are brewing this month, on your phone. Rising and falling styles, hops and yeasts, every ingredient ranked by recipe count, a map of where the most used hops grow plus search.

**Live site:** https://ankurnapa.github.io/brew-pulse/

## Built on Beer Analytics

Every number comes from [Beer Analytics](https://www.beer-analytics.com), created by Christian Scheb. He gathers brewing recipes from homebrewing communities online and analyses what goes into them. The analysis is his. If you find this useful, visit his site or star [his project](https://github.com/scheb/beer-analytics).

Beer Analytics content is licensed [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). The data in `data.json` is an adaptation of it, shared under the same licence. No recipes are copied: they belong to their authors, so every item links back to its Beer Analytics page.

## What this adds

- A monthly headline plus movers, worked out from the trend data
- Browse every style, hop, yeast or malt by recipe count
- Hop origins by country, weighted by recipe count
- Search across all four lists
- A phone first layout in the Apple system style, with dark mode

## How it works

Plain HTML, CSS and JavaScript with no build step. `index.html` loads `app.js`, which reads `data.json`. The data file is rebuilt from a polite crawl of the public Beer Analytics pages.

Run it locally:

```
python3 -m http.server 8000
```

## Licence

Code (`index.html`, `app.css`, `app.js`): MIT. Data (`data.json`): CC BY-SA 4.0, adapted from Beer Analytics by Christian Scheb.

Made by [Ankur Napa](https://github.com/AnkurNapa).

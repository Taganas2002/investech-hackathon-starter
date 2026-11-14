# Documentation & screenshots

Visual tour of **WSP Index Admission Analysis**.  
These images show the UI only — **no API keys** are included.

Back to the main guide: [README.md](../README.md)

---

## 1. Decision

Admission verdict and the four pillars (peer quality, value per share, deal execution, index fit).

![Decision](screenshots/01-decision.png)

---

## 2. WSP at a glance

Headline KPIs: price, market cap, backlog, employees, leverage, margins, growth.

![Glance KPIs](screenshots/02-glance-top.png)

Price / market-cap trends, regional revenue, EBITDA, leverage, and statements.

![Glance charts](screenshots/03-glance-charts.png)

---

## 3. Peer comparison

WSP vs peer set on growth, FCF margin, reinvestment, ROIC, and leverage.

![Peer comparison](screenshots/06-peers.png)

---

## 4. Value per share

FCF/share and EPS CAGRs vs share-count growth.

![Value per share](screenshots/04-per-share.png)

![Per-share charts](screenshots/05-per-share-detail.png)

---

## 5. Deal execution

Acquisition promises, status tracking, and earnings-call claims.

![Deal execution](screenshots/07-deals.png)

---

## How to run (short)

```bash
# Terminal 1
cd server && npm install && copy .env.example .env && npm run dev

# Terminal 2
cd client && npm install && npm run dev
```

Open http://localhost:5173  
If live Onesheet fails, enable **Offline snapshot**.

## Deploy

See the **Deploy on Vercel** section in the root [README.md](../README.md).

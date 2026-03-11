# Hedging impermanent loss in concentrated liquidity: what actually works in 2026

**The uncomfortable truth about hedging Uniswap V3 impermanent loss is that no strategy eliminates cost — each approach merely converts uncertain IL into predictable expenses.** The critical question is whether LP fee income exceeds hedging costs, and the answer depends heavily on pool selection, range width, and market regime. A simple "hedge with perps post-range-exit" strategy on Hyperliquid addresses directional risk cheaply but leaves the non-linear gamma exposure — the core mathematical challenge — completely unhedged. The most robust empirical evidence to date, a Gyroscope Protocol backtest of delta-neutral LP with perpetual futures, shows **134% APY and an 87% win rate over 30-day windows**, with funding costs proving negligible over multi-month horizons. Meanwhile, the dedicated IL hedging protocol ecosystem remains immature: Panoptic, GammaSwap, Itos, and Smilee collectively hold under **$15 million in TVL**, and the most theoretically sound approach — static replication with options — is practical only for ETH and BTC pairs on Deribit.

---

## Half of all Uniswap V3 LPs lose money, and the math explains why

The empirical foundation for IL hedging research rests on the landmark Loesch et al. study (arXiv:2111.09192), which analyzed 17,000+ wallets across 17 Uniswap V3 pools from May to September 2021. The results were stark: **$199.3 million in fees earned versus $260.1 million in impermanent loss**, leaving a net deficit of $60.8 million. Roughly **49.5% of LPs had negative returns** versus simply holding. Short-duration positions (under one week) fared worst, with IL exceeding fees by 80%. Only pools with correlated assets like WBTC/WETH consistently generated positive returns.

The academic framework has matured substantially since then. Four papers form the theoretical backbone of modern IL hedging:

**Khakhar & Chen (arXiv:2208.03318)** introduced a proper "Liquidity Position PnL" metric and derived a delta-hedging algorithm for arbitrary V3 positions. Their key insight: the traditional IL metric is misleading because it uses the wrong benchmark. The correct approach decomposes LP exposure into delta and gamma components, then hedges each independently.

**Lipton, Lucic & Sepp (arXiv:2407.05146)**, published in *Digital Finance* in 2025, provides the most comprehensive framework to date. It introduces the **"IL protection claim"** — a contingent claim delivering the negative of IL at maturity — and proves it can be perfectly hedged via static replication with European vanilla options, independent of any pricing model. The paper also develops dynamic hedging under Black-Scholes and stochastic volatility models, explicitly referencing Hyperliquid, GMX, Aevo, Binance, and Deribit as viable hedging venues.

**Deng, Zong & Wang (arXiv:2205.12043)**, published in *Operations Research Letters*, derives two closed-form static replication formulas using European calls or puts with strikes within the LP price interval. Testing against Deribit BTC options under Heston stochastic volatility shows **"astonishing accuracy"** — residual errors below 2.5 basis points when sufficient strikes are available.

**Fukasawa, Maire & Wunsch** (published in *Applied Mathematical Finance*, 2025) demonstrate a model-free super-hedging strategy for G3M impermanent loss using weighted variance swaps, though variance swaps remain essentially untradeable in crypto markets.

---

## The protocol landscape is promising in theory but anemic in liquidity

Five protocols specifically target IL hedging or LP risk management, but none has achieved meaningful scale. Here is their current state:

**Panoptic** is the most theoretically elegant solution. It treats Uniswap V3 LP positions as what they mathematically are — short options — and enables users to go long (buying options by removing liquidity) or construct multi-leg strategies like protective puts that offset IL. Pricing is oracle-free, with streaming premia based on actual trading activity rather than Black-Scholes. The protocol launched V1 on Ethereum mainnet in December 2024 but suffered a vulnerability (all funds were rescued). V1.1 deployed across Base, Unichain, and Ethereum carries a TVL of approximately **$6,700** — essentially negligible. V2 beta, featuring cross-margin vaults and an open-sourced liquidation bot SDK, has completed three audits and is imminent. Backed by $11.5M from Jane Street, Uniswap Labs Ventures, and Coinbase Ventures, Panoptic remains a protocol to watch rather than use at scale today.

**GammaSwap** takes a different approach: users borrow actual LP tokens from AMM pools, receiving the inverse payoff — **"impermanent gain."** This creates an oracle-free perpetual options market where borrowing LP equals going long volatility. The protocol is live on Arbitrum ($5.1M), Base ($2.5M), and Ethereum, with total TVL of approximately **$7.6 million** and cumulative DEX volume of $178M. Its upcoming "yield tokens" (automated products that LP into concentrated ranges while using GammaSwap positions to hedge IL) reportedly backtest at 60–80% APY for WETH, though these are not yet fully launched. GammaSwap currently relies on Uniswap V2-style constant-product pools via its DeltaSwap AMM, meaning hedging V3 positions requires leverage multiplier calculations — adding complexity.

**Itos Finance** proposes the most integrated design: a Two-Sided AMM where "Liquidity Taking" positions sit on the opposing curve to LP positions, creating native impermanent gain within the same exchange. A hedge can be placed just outside the LP range so it activates automatically when price exits. The co-founder hails from Hudson River Trading. However, **Itos is not live** — it has no TVL, no audits, and no confirmed mainnet date.

**Smilee Finance** decomposes IL into tradeable volatility products. Earn Vaults act as option sellers (collecting premiums), while "Impermanent Gain" options let traders buy the inverse IL payoff at up to 500x leverage. The protocol is live primarily on Berachain ($3.4M TVL) with minimal presence on Arbitrum. Its epoch-based system (daily, weekly, monthly maturities) limits flexibility, and cumulative options premium volume of $335K suggests thin adoption.

**Automated liquidity managers** (Arrakis at ~$75M TVL, Gamma Strategies at ~$10M, Steer Protocol at ~$40M) optimize range management and fee capture but explicitly **do not hedge IL**. They reduce IL exposure through active rebalancing but leave the fundamental convex risk intact. A Gauntlet analysis found that even these managers' performance varies widely, with some ETH vaults experiencing periods of negative returns.

---

## What the backtests actually show about hedging with perps

The strongest empirical evidence for perpetual futures hedging comes from **Gyroscope Protocol's delta-neutral E-CLP backtest**, published in 2025. Over an 8-month period on an ETH/USDC position, the strategy generated **$893,000 profit on a $1M position** (134% APY), with positive P&L in approximately 73% of hours and **87% of 30-day rolling windows**. The critical finding: perpetual funding rates had a **negligible net effect**, approximately canceling out over time. A three-month stretch of persistently small negative P&L (March–May 2025) occurred during low volumes and imperfect hedging, but the strategy recovered. The hedge was rebalanced hourly.

A separate backtest by TacitvsXI (open-source on GitHub) tested hedging Uniswap V2 ETH/USDC with Binance perpetual contracts, using a 50% hedge ratio triggered when IL exceeded 3%. During ETH's 19.6x price surge from January 2020 to July 2021, the hedged portfolio outperformed both holding and unhedged LP, with significantly reduced volatility.

The IDEG/CTH institutional study backtested grid-based hedging with Binance perpetuals on a $1M ETH/USDT position, finding that IL remains below 1% when ETH price stays within a -24.5% to +32.5% range — calling the sensitivity of IL to moderate price changes "very weak."

**Funding rate economics strongly favor the strategy.** Ethena's $14.3B USDe stablecoin — the largest live delta-neutral perpetual futures strategy in DeFi — demonstrates the structural dynamics. Historical OI-weighted ETH perp funding averaged **16% APY in 2021, 0.6% in 2022 (bear market), ~9% in 2023, and ~13% in 2024**. Funding rates were positive more than **92% of Q3 2025** per BitMEX data, meaning short hedgers *received* funding in the dominant market regime. Hyperliquid specifically shows BTC mean funding of ~0.0097%/hour and ETH at ~0.0131%/hour, with maker fees at 0.01% and taker at 0.035%.

A critical gap exists in the literature: **no published study specifically backtests the "open perp short only after range exit" strategy**. The Gyroscope study hedged continuously from entry, not conditionally at range boundaries. However, one important insight from CrocSwap researcher Atis Elsts helps: when a V3 position exits its range, it becomes **fully linear** (100% in one token), making it trivially hedgeable with a simple perp position. The challenge is the execution gap between range exit and hedge placement, during which further price movement goes unhedged.

---

## Why perpetual futures are a flawed but practical hedge for the non-linear IL payoff

The fundamental mismatch between perps and IL is mathematical: **IL is convex (short gamma), while perps are linear (zero gamma)**. An LP position in Uniswap V3 behaves like a short straddle — being simultaneously short a put and short a call. When price rises, the LP loses the appreciating asset (short call payoff); when price falls, the LP accumulates the depreciating asset (short put payoff). The loss accelerates quadratically with price deviation, and no amount of linear perp hedging captures this curvature.

Five alternative strategies address this non-linearity, each with distinct tradeoff profiles:

**Static replication with vanilla options** is the gold standard for hedge accuracy. Per the Lipton/Sepp framework, buying a strip of 15–25 European calls and puts across the LP range on Deribit achieves residual error below **2.5 basis points**. At typical ETH implied volatility of 45–65%, this costs approximately **15–25% APR** for a moderate concentration range. The approach works exclusively for ETH and BTC pairs — altcoin options markets have spreads of 200–300 basis points versus 1–5 for futures. For positions under $100K, Deribit's contract granularity and minimum sizes make full replication challenging. Derive (formerly Lyra), now the largest on-chain options venue at $850M+ open interest, offers an emerging alternative but with shallower liquidity.

**Power perpetuals (Squeeth)** were theoretically promising — since IL scales with price², buying ETH² exposure hedges the gamma component. In practice, the capital requirements proved disqualifying: matching an LP position's gamma required approximately **10x the delta in Squeeth**, which then needed its own perp hedge. Funding costs ran **30–80% annualized** during volatile periods. Opyn shut down Squeeth permanently on November 4, 2024, following a CFTC enforcement action. Deri Protocol still offers ETH² and BTC² power perps with limited liquidity. Opyn Markets, the successor platform for permissionless power perp deployment, has not reached full operation as of early 2026.

**Dynamic delta-hedging with perps** — rebalancing a perp position every 4–8 hours as the LP's delta drifts — is the most practically accessible strategy. Transaction costs on Hyperliquid are minimal (spreads under 0.25bp, no gas), and Alexander & Hilling (2023) in *Quantitative Finance* showed that 8-hour rebalancing significantly reduces hedging error versus set-and-forget approaches. The critical insight, however, is that **the total cost of dynamic delta hedging converges mathematically to the realized variance** — which is exactly what IL costs. The strategy doesn't reduce expense; it converts uncertain IL into more predictable, smoother trading costs. Its value is P&L path stabilization, not cost reduction.

**The hybrid approach — perps for delta plus a small options position for gamma** — offers the best practical balance. Shorting perps on Hyperliquid (receiving funding in bull markets) neutralizes first-order exposure at near-zero cost, while buying a single ATM straddle or OTM strangle on Deribit covers the gamma gap. For a $50K ETH/USDC position, estimated costs are 18–30% APR, potentially covered by concentrated LP fees of 20–50%+ APR in high-volume pools.

**OrBit Markets** deserves special mention as the leading CeFi solution. Backed by Matrixport and Brevan Howard Digital, OrBit sells IL Protection Options — custom exotic derivatives that pay the exact mirror image of IL at maturity for a fixed upfront premium. Historical pricing showed 7-day V2 protection at just **3.6% annualized** — 30% of average historical IL. MEV Capital, a Lithuania-based hedge fund with $32M+ AUM, uses OrBit's exotic options packages alongside tight-range V3 positions to run fully hedged institutional LP strategies.

---

## Practical viability for a sub-$100K bot using Hyperliquid perps

For the specific use case of a bot hedging concentrated LP positions with Hyperliquid perpetual futures post-range-exit, the evidence supports cautious deployment with clear-eyed expectations:

The strategy is **directionally sound but mathematically incomplete**. It captures the right risk (delta exposure after range exit) at the right venue (Hyperliquid's deep liquidity, low fees, hourly funding). Funding costs are likely net-positive or negligible over time given the >92% positive rate structural bias. Transaction costs for a $50–100K position are immaterial at ~$0.50–$5 per rebalance.

The unhedged residual is the **gamma accumulated while in-range** and any **execution gap at range boundaries**. For wide ranges (±20%+), this residual is manageable. For tight ranges (±5%), gamma exposure is 4–10x higher, and the post-exit hedge arrives too late to prevent most of the damage.

Three enhancements would meaningfully improve the approach. First, adding a continuous delta hedge while in-range (not just post-exit) — the Gyroscope evidence shows this works and funding costs wash out. Second, supplementing with a single monthly OTM strangle on Deribit for gamma protection on ETH or BTC positions — adding 3–5% monthly but covering tail moves. Third, monitoring GammaSwap's yield tokens and Panoptic V2 for native, capital-efficient gamma hedging as these protocols mature past their current sub-$10M TVL levels.

## Conclusion

The IL hedging landscape in early 2026 sits at an awkward inflection point. The theoretical framework is mature — Lipton/Sepp's 2025 paper provides a complete, model-independent hedging methodology. The practical infrastructure is not. Dedicated hedging protocols collectively hold under $15M in TVL, Squeeth is dead, and on-chain options liquidity remains a fraction of CeFi. For a bot operator today, the highest-conviction path is continuous delta hedging with Hyperliquid perps (not just post-range-exit), accepting residual gamma as the cost of simplicity. The Gyroscope backtest's 134% APY result, while a single trajectory, demonstrates this approach's potential when LP fee income is strong. The key risk isn't the hedge itself — it's selecting the wrong pool, the wrong range width, or operating during a prolonged low-volume regime where fees fail to cover even minimal hedging friction.
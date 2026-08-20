import { lazy } from "react";
import { Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { Home } from "./pages/Home";

/*
 * Pages are code-split so the initial load only pays for what it shows.
 * Recharts is by far the heaviest dependency and only Graphs, Elo and
 * ManagerDetail need it, so Home no longer downloads it. Layout stays
 * eager - it's the shell every route renders inside.
 *
 * Home itself is deliberately NOT code-split, unlike the rest: it's the
 * landing page almost everyone hits first, and lazy-loading it meant the
 * route-level Suspense fallback (a small generic spinner) briefly showed
 * before Home's own properly-sized SkeletonHome could - a large, mostly
 * pointless layout shift (tiny spinner -> tall skeleton -> real content)
 * that was the actual dominant source of this page's poor CLS score.
 * Going straight to SkeletonHome removes that stage.
 */
const History = lazy(() => import("./pages/History").then((m) => ({ default: m.History })));
const Graphs = lazy(() => import("./pages/Graphs").then((m) => ({ default: m.Graphs })));
const Elo = lazy(() => import("./pages/Elo").then((m) => ({ default: m.Elo })));
const Predictions = lazy(() =>
  import("./pages/Predictions").then((m) => ({ default: m.Predictions })),
);
const ManagerDetail = lazy(() =>
  import("./pages/ManagerDetail").then((m) => ({ default: m.ManagerDetail })),
);
const PlayoffOdds = lazy(() =>
  import("./pages/PlayoffOdds").then((m) => ({ default: m.PlayoffOdds })),
);

function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="history" element={<History />} />
        <Route path="graphs" element={<Graphs />} />
        <Route path="elo" element={<Elo />} />
        <Route path="predictions" element={<Predictions />} />
        <Route path="playoff-odds" element={<PlayoffOdds />} />
        <Route path="manager/:userId" element={<ManagerDetail />} />
      </Route>
    </Routes>
  );
}

export default App;

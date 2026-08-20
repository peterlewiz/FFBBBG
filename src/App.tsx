import { lazy } from "react";
import { Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";

/*
 * Pages are code-split so the initial load only pays for what it shows.
 * Recharts is by far the heaviest dependency and only Graphs, Elo and
 * ManagerDetail need it, so Home no longer downloads it. Layout stays
 * eager - it's the shell every route renders inside.
 */
const Home = lazy(() => import("./pages/Home").then((m) => ({ default: m.Home })));
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

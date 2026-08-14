import { Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { Home } from "./pages/Home";
import { History } from "./pages/History";
import { Graphs } from "./pages/Graphs";
import { Elo } from "./pages/Elo";
import { Predictions } from "./pages/Predictions";
import { ManagerDetail } from "./pages/ManagerDetail";

function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="history" element={<History />} />
        <Route path="graphs" element={<Graphs />} />
        <Route path="elo" element={<Elo />} />
        <Route path="predictions" element={<Predictions />} />
        <Route path="manager/:userId" element={<ManagerDetail />} />
      </Route>
    </Routes>
  );
}

export default App;

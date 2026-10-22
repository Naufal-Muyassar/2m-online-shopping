import { Route, Routes } from "react-router-dom";

export function App() {
  return (
    <Routes>
      <Route path="/" element={<main className="p-4">2M Admin</main>} />
    </Routes>
  );
}

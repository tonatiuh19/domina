import { render } from "@testing-library/react";
import { HelmetProvider } from "react-helmet-async";
import { Provider } from "react-redux";
import { MemoryRouter } from "react-router-dom";
import { beforeAll, describe, expect, it } from "vitest";
import { store } from "@/store";
import Home from "@/pages/public/Home";
import i18n from "@/i18n";

beforeAll(async () => {
  await i18n.changeLanguage("es");
});

describe("Home", () => {
  it("shows the workshop promise", async () => {
    await i18n.changeLanguage("es");
    const view = render(
      <HelmetProvider>
        <Provider store={store}>
          <MemoryRouter>
            <Home />
          </MemoryRouter>
        </Provider>
      </HelmetProvider>,
    );
    expect(view.getByRole("heading", { level: 1 }).textContent).toMatch(/APRENDE/);
    expect(view.getByRole("heading", { level: 1 }).textContent).toMatch(/PRACTICA/);
    expect(view.getAllByText(/DOMINA/).length).toBeGreaterThan(0);
  });
});

import * as React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useForm } from "react-hook-form";
import { NativeSelect } from "../input";

describe("NativeSelect (styled dropdown)", () => {
  it("works controlled: shows the label and reports changes through onChange(e.target.value)", async () => {
    const onChange = vi.fn();
    function Controlled() {
      const [v, setV] = React.useState("");
      return (
        <NativeSelect aria-label="Sort" value={v} onChange={(e) => { onChange(e.target.value); setV(e.target.value); }}>
          <option value="">All</option>
          <option value="price_asc">Price: low to high</option>
        </NativeSelect>
      );
    }
    render(<Controlled />);
    const trigger = screen.getByRole("combobox", { name: "Sort" });
    expect(trigger).toHaveTextContent("All");
    await userEvent.click(trigger);
    await userEvent.click(await screen.findByRole("option", { name: "Price: low to high" }));
    expect(onChange).toHaveBeenCalledWith("price_asc");
    expect(trigger).toHaveTextContent("Price: low to high");
  });

  it("works with react-hook-form register, reset and submit", async () => {
    const submitted = vi.fn();
    function Form() {
      const form = useForm({ defaultValues: { unit: "kg" } });
      return (
        <form onSubmit={form.handleSubmit(submitted)}>
          <label htmlFor="unit">Unit</label>
          <NativeSelect id="unit" {...form.register("unit")}>
            <option value="pcs">Piece</option>
            <option value="kg">Kilogram</option>
            <option value="m">Metre</option>
          </NativeSelect>
          <button type="button" onClick={() => form.reset({ unit: "m" })}>Reset</button>
          <button type="submit">Save</button>
        </form>
      );
    }
    render(<Form />);
    const trigger = screen.getByRole("combobox", { name: "Unit" });
    expect(trigger).toHaveTextContent("Kilogram");
    await userEvent.click(screen.getByRole("button", { name: "Reset" }));
    expect(trigger).toHaveTextContent("Metre");
    await userEvent.click(trigger);
    await userEvent.click(await screen.findByRole("option", { name: "Piece" }));
    expect(trigger).toHaveTextContent("Piece");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(submitted).toHaveBeenCalledWith({ unit: "pcs" }, expect.anything());
  });
});

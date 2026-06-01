import { mountApp } from "./app.js";

const root = document.querySelector("#app");
if (root instanceof HTMLElement) mountApp(root);

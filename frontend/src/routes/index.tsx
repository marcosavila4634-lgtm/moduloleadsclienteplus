import { createFileRoute, redirect } from "@tanstack/react-router";
import { lerToken } from "../lib/api";

export const Route = createFileRoute("/")({
  beforeLoad: () => {
    throw redirect({ to: lerToken() ? "/painel" : "/login" });
  },
});

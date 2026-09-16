/** Identity carried inside Worker-issued tokens. Never holds tokens or secrets. */
export type AuthProps = {
  sub: string;
  email: string;
  name: string;
  clientId: string;
  clientName: string;
};

export function isAuthProps(value: unknown): value is AuthProps {
  if (typeof value !== "object" || value === null) return false;
  const props = value as Record<string, unknown>;
  return (
    typeof props.sub === "string" &&
    props.sub !== "" &&
    typeof props.email === "string" &&
    props.email.includes("@") &&
    typeof props.name === "string" &&
    typeof props.clientId === "string" &&
    props.clientId !== "" &&
    typeof props.clientName === "string"
  );
}

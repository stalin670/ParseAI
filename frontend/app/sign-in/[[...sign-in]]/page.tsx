import { SignIn } from "@clerk/nextjs";

export default function Page() {
  return (
    <main className="flex flex-1 items-center justify-center overflow-y-auto">
      <SignIn />
    </main>
  );
}

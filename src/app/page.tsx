import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/user";

export default async function Home() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  if (user.role === "TBIG") {
    redirect("/tbig/pengadaan");
  } else {
    redirect("/vendor/pengadaan");
  }
}

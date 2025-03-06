"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    router.push('/patches');
  }, [router]);

  // Returning null as this component will redirect
  return null;
}

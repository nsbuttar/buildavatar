import { OnboardingForm } from "@/components/onboarding-form";
import { requirePageAuth } from "@/lib/page-auth";

export default async function OnboardingPage() {
  await requirePageAuth();
  return <OnboardingForm />;
}

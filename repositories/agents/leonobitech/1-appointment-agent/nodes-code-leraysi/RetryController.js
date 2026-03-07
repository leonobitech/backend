const MAX_ATTEMPTS = 3;
const currentAttempt = Number(
  $execution.customData.get("masterAgentAttempt") || "1",
);
$execution.customData.set("masterAgentAttempt", String(currentAttempt + 1));

const errorData = $input.first().json;
const errorMessage =
  errorData?.error?.message || errorData?.message || "Unknown error";
console.log(
  `[RetryController] Intento ${currentAttempt}/${MAX_ATTEMPTS} falló: ${errorMessage}`,
);

return [
  {
    json: {
      attempt: currentAttempt,
      maxAttempts: MAX_ATTEMPTS,
      canRetry: currentAttempt < MAX_ATTEMPTS,
      errorMessage,
    },
  },
];

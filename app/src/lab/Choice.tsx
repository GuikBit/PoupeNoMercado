/** Grupo de botões exclusivos — substitui radio, reutilizado nos formulários. */
import { Button, Paragraph, XStack, YStack } from 'tamagui';

interface ChoiceProps<T extends string> {
  label: string;
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}

export function Choice<T extends string>({ label, options, value, onChange }: ChoiceProps<T>) {
  return (
    <YStack gap="$1">
      <Paragraph size="$2" color="$color10">
        {label}
      </Paragraph>
      <XStack gap="$2" flexWrap="wrap">
        {options.map((option) => (
          <Button
            key={option.value}
            size="$2"
            theme={option.value === value ? 'accent' : undefined}
            onPress={() => onChange(option.value)}
          >
            {option.label}
          </Button>
        ))}
      </XStack>
    </YStack>
  );
}

import { mergeConfig } from 'vite'
import { defineConfig } from 'vitest/config'

import viteConfig from './vite.config.ts'

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      include: [
        'src/**/*.test.tsx',
        'src/features/auth/auth-navigation.test.ts',
        'src/config/professional-support.test.ts',
        'src/config/image-provider.test.ts',
        'src/utils/image-url.test.ts',
      ],
    },
  }),
)

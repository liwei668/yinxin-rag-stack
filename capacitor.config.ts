import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.yinxin.agi',
  appName: 'Yinxin.AGI',
  webDir: '.next/static',
  server: {
    androidScheme: 'https',
    url: 'https://liugeshu.com'
  }
};

export default config;

/**
 * 验证 is_adult 黄色源对所有人默认隐藏（含站长）
 */
import { AdminConfig } from '@/lib/admin.types';
import {
  getAvailableApiSites,
  refineConfig,
  setCachedConfig,
} from '@/lib/config';

function baseConfig(disableYellowFilter: boolean): AdminConfig {
  return {
    ConfigFile: '',
    ConfigSubscribtion: { URL: '', AutoUpdate: false, LastCheck: '' },
    SiteConfig: {
      SiteName: 't',
      Announcement: '',
      SearchDownstreamMaxPage: 5,
      SiteInterfaceCacheTime: 7200,
      DoubanProxyType: '',
      DoubanProxy: '',
      DoubanImageProxyType: '',
      DoubanImageProxy: '',
      DisableYellowFilter: disableYellowFilter,
      FluidSearch: true,
      EnableWebLive: false,
    },
    UserConfig: {
      AllowRegister: true,
      Users: [
        { username: 'owner', role: 'owner' },
        { username: 'newbie', role: 'user' },
        // 组成员：组里勾了黄色源
        { username: 'vip', role: 'user', tags: ['adult-group'] },
      ],
      Tags: [{ name: 'adult-group', enabledApis: ['normal', 'adult'] }],
    },
    SourceConfig: [
      { key: 'normal', name: '普通源', api: 'https://a.com', from: 'config', disabled: false },
      { key: 'adult', name: '黄色源', api: 'https://b.com', from: 'config', disabled: false, is_adult: true },
      { key: 'off', name: '停用源', api: 'https://c.com', from: 'config', disabled: true },
    ],
    CustomCategories: [],
  } as AdminConfig;
}

describe('is_adult 黄色源对所有人默认隐藏', () => {
  it('refineConfig 将 config.json 的 is_adult 透传进 SourceConfig', () => {
    const refined = refineConfig({
      ...baseConfig(false),
      ConfigFile: JSON.stringify({
        api_site: { x: { api: 'https://x.com', name: 'X源', is_adult: true } },
      }),
      SourceConfig: [],
    });
    expect(refined.SourceConfig[0].is_adult).toBe(true);
  });

  it('默认：新注册/无组用户看不到黄色源', async () => {
    await setCachedConfig(baseConfig(false));
    const sites = await getAvailableApiSites('newbie');
    expect(sites.map((s) => s.key)).toEqual(['normal']);
  });

  it('默认：站长也看不到黄色源', async () => {
    await setCachedConfig(baseConfig(false));
    const sites = await getAvailableApiSites('owner');
    expect(sites.map((s) => s.key)).toEqual(['normal']);
  });

  it('默认：连组里显式勾了黄色源的用户也看不到', async () => {
    await setCachedConfig(baseConfig(false));
    const sites = await getAvailableApiSites('vip');
    expect(sites.map((s) => s.key)).toEqual(['normal']);
  });

  it('无用户参数路径同样隐藏', async () => {
    await setCachedConfig(baseConfig(false));
    const sites = await getAvailableApiSites();
    expect(sites.map((s) => s.key)).toEqual(['normal']);
  });

  it('管理员打开"禁用黄色过滤器"后放开', async () => {
    await setCachedConfig(baseConfig(true));
    expect((await getAvailableApiSites('newbie')).map((s) => s.key)).toEqual(['normal', 'adult']);
    expect((await getAvailableApiSites('owner')).map((s) => s.key)).toEqual(['normal', 'adult']);
    expect((await getAvailableApiSites('vip')).map((s) => s.key)).toEqual(['normal', 'adult']);
  });
});

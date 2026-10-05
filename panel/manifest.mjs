// CSXS/manifest.xml of the panel (spec 6): one extension for AE and Premiere, CEP 12 (CSXS 11), Node on.
// The host bundle loads through ScriptPath when the panel opens; the bridge loads it again on a cold start.
export function manifestXml({ version }) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<ExtensionManifest xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
                   ExtensionBundleId="ru.cloud.brandkit"
                   ExtensionBundleVersion="${version}"
                   ExtensionBundleName="Cloud.ru BrandKit"
                   Version="11.0">
  <ExtensionList>
    <Extension Id="ru.cloud.brandkit.panel" Version="${version}" />
  </ExtensionList>
  <ExecutionEnvironment>
    <HostList>
      <Host Name="AEFT" Version="[26.0,99.9]" />
      <Host Name="PPRO" Version="[26.0,99.9]" />
    </HostList>
    <LocaleList>
      <Locale Code="All" />
    </LocaleList>
    <RequiredRuntimeList>
      <RequiredRuntime Name="CSXS" Version="11.0" />
    </RequiredRuntimeList>
  </ExecutionEnvironment>
  <DispatchInfoList>
    <Extension Id="ru.cloud.brandkit.panel">
      <DispatchInfo>
        <Resources>
          <MainPath>./index.html</MainPath>
          <ScriptPath>./host/brandkit.jsx</ScriptPath>
          <CEFCommandLine>
            <Parameter>--enable-nodejs</Parameter>
            <Parameter>--mixed-context</Parameter>
            <Parameter>--allow-file-access-from-files</Parameter>
            <Parameter>--allow-file-access</Parameter>
          </CEFCommandLine>
        </Resources>
        <Lifecycle>
          <AutoVisible>true</AutoVisible>
        </Lifecycle>
        <UI>
          <Type>Panel</Type>
          <Menu>Cloud.ru BrandKit</Menu>
          <Geometry>
            <Size>
              <Height>640</Height>
              <Width>360</Width>
            </Size>
            <MinSize>
              <Height>360</Height>
              <Width>280</Width>
            </MinSize>
          </Geometry>
        </UI>
      </DispatchInfo>
    </Extension>
  </DispatchInfoList>
</ExtensionManifest>
`;
}

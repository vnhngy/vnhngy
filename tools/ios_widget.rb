# Baut das iPhone-Widget in das von Capacitor erzeugte Xcode-Projekt ein (aufgerufen von tools/patch_native.py ios).
#  - App-Ziel: Widget-Brücke (Plugin) und gemeinsamer Code, Berechtigung für die App-Gruppe
#  - neues Ziel "CarlumeWidget" (Widget-Erweiterung, iOS 17+), wird in die App eingebettet
# Braucht das Ruby-Paket xcodeproj (gem install xcodeproj).
require 'xcodeproj'
require 'json'

root = File.expand_path('..', __dir__)
cfg = JSON.parse(File.read(File.join(root, 'app.config.json')))
build = (ENV['BUILD_NUMBER'].to_s.empty? ? cfg['build'] : ENV['BUILD_NUMBER']).to_s
proj_path = File.join(root, 'ios', 'App', 'App.xcodeproj')
project = Xcodeproj::Project.open(proj_path)

app = project.targets.find { |t| t.name == 'App' } or abort('Widget: Ziel "App" fehlt im Xcode-Projekt')
if project.targets.any? { |t| t.name == 'CarlumeWidget' }
  puts 'Widget: schon eingebaut'
  exit 0
end

# --- App-Ziel: Brücke + gemeinsamer Code (Dateien liegen in ios/App/App/Carlume) ---
app_group = project.main_group.children.find { |g| (g.respond_to?(:path) && g.path == 'App') || (g.respond_to?(:name) && g.name == 'App') }
if app_group.nil?
  puts project.main_group.children.map { |g| "#{g.isa} name=#{g.respond_to?(:name) ? g.name : '-'} path=#{g.respond_to?(:path) ? g.path : '-'}" }
  abort('Widget: Gruppe "App" fehlt')
elsif app_group.isa.include?('Synchronized')
  puts 'Widget: Ordner App wird von Xcode synchronisiert, App/Carlume ist automatisch dabei'
else
  carlume = app_group.new_group('Carlume', 'Carlume')
  app.add_file_references([carlume.new_reference('CarlumeShared.swift'), carlume.new_reference('WidgetBridge.swift')])
end

# --- Widget-Ziel (Dateien liegen in ios/App/CarlumeWidget) ---
widget = project.new_target(:app_extension, 'CarlumeWidget', :ios, '17.0', nil, :swift)
wgroup = project.main_group.new_group('CarlumeWidget', 'CarlumeWidget')
wgroup.new_reference('Info.plist')
wgroup.new_reference('CarlumeWidget.entitlements')
widget.add_file_references([wgroup.new_reference('CarlumeWidget.swift'), wgroup.new_reference('CarlumeShared.swift')])
# Frameworks (WidgetKit, SwiftUI, AppIntents) bindet Swift über die imports selbst ein; Standard-Eintrag entfernen
widget.frameworks_build_phase.files.to_a.each(&:remove_from_project)

team = nil
app.build_configurations.each do |c|
  team ||= c.build_settings['DEVELOPMENT_TEAM']
  c.build_settings['CODE_SIGN_ENTITLEMENTS'] = 'App.entitlements'
end

widget.build_configurations.each do |c|
  s = c.build_settings
  s['PRODUCT_BUNDLE_IDENTIFIER'] = "#{cfg['appId']}.widget"
  s['PRODUCT_NAME'] = '$(TARGET_NAME)'
  s['INFOPLIST_FILE'] = 'CarlumeWidget/Info.plist'
  s['GENERATE_INFOPLIST_FILE'] = 'NO'
  s['CODE_SIGN_ENTITLEMENTS'] = 'CarlumeWidget/CarlumeWidget.entitlements'
  s['CODE_SIGN_STYLE'] = 'Automatic'
  s['DEVELOPMENT_TEAM'] = team if team
  s['SWIFT_VERSION'] = '5.0'
  s['IPHONEOS_DEPLOYMENT_TARGET'] = '17.0'
  s['TARGETED_DEVICE_FAMILY'] = '1'
  s['MARKETING_VERSION'] = cfg['version']
  s['CURRENT_PROJECT_VERSION'] = build
  s['SKIP_INSTALL'] = 'YES'
  s['APPLICATION_EXTENSION_API_ONLY'] = 'YES'
  s['LD_RUNPATH_SEARCH_PATHS'] = ['$(inherited)', '@executable_path/Frameworks', '@executable_path/../../Frameworks']
  s['SWIFT_EMIT_LOC_STRINGS'] = 'YES'
end

# --- Widget in die App einbetten ---
app.add_dependency(widget)
embed = app.copy_files_build_phases.find { |p| p.name == 'Embed Foundation Extensions' } ||
        app.new_copy_files_build_phase('Embed Foundation Extensions')
embed.symbol_dst_subfolder_spec = :plug_ins
bf = embed.add_file_reference(widget.product_reference, true)
bf.settings = { 'ATTRIBUTES' => ['RemoveHeadersOnCopy'] }

# Einbetten vor eventuellen Skript-Schritten, sonst meldet Xcode manchmal einen Zyklus
phases = app.build_phases
phases.delete(embed)
idx = phases.index { |p| p.isa == 'PBXShellScriptBuildPhase' } || phases.length
phases.insert(idx, embed)

project.save
puts "Widget eingebaut: CarlumeWidget (#{cfg['appId']}.widget), App-Gruppe group.#{cfg['appId']}"


import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

class OrvixThemeController extends ChangeNotifier {
  OrvixThemeController._();

  static final OrvixThemeController instance =
      OrvixThemeController._();

  static const String _storageKey = 'orvix_theme_mode';

  ThemeMode _themeMode = ThemeMode.light;
  bool _loaded = false;

  ThemeMode get themeMode => _themeMode;
  bool get isDark => _themeMode == ThemeMode.dark;
  bool get isLoaded => _loaded;

  Future<void> load() async {
    if (_loaded) return;

    final prefs = await SharedPreferences.getInstance();
    final savedTheme = prefs.getString(_storageKey);

    _themeMode =
        savedTheme == 'dark' ? ThemeMode.dark : ThemeMode.light;

    _loaded = true;
    notifyListeners();
  }

  Future<void> toggleTheme() async {
    await setTheme(
      isDark ? ThemeMode.light : ThemeMode.dark,
    );
  }

  Future<void> setTheme(ThemeMode mode) async {
    if (_themeMode == mode) return;

    _themeMode = mode;
    notifyListeners();

    final prefs = await SharedPreferences.getInstance();

    await prefs.setString(
      _storageKey,
      mode == ThemeMode.dark ? 'dark' : 'light',
    );
  }
}

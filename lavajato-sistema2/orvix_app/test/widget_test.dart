
import 'package:flutter_test/flutter_test.dart';
import 'package:orvix_app/app.dart';

void main() {
  testWidgets('Orvix inicia corretamente', (WidgetTester tester) async {
    await tester.pumpWidget(const OrvixApp());

    expect(find.byType(OrvixApp), findsOneWidget);
  });
}

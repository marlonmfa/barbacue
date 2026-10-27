import 'dart:convert';
import 'dart:io';
import 'dart:ui' as ui;
import 'package:barbacue/management/cog_login.dart';
import 'package:barbacue/management/management_api.dart';
import 'package:barbacue/management/management_app.dart';
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:integration_test/integration_test.dart';
class QaTransport extends http.BaseClient {
 final http.Client inner=http.Client();String? cookie;
 @override Future<http.StreamedResponse> send(http.BaseRequest original) async {
  final request=http.Request(original.method,Uri.parse('http://127.0.0.1:54795').resolve(original.url.path))..headers.addAll(original.headers)..followRedirects=false;
  request.bodyBytes=await original.finalize().toBytes();
  if(original.headers['Cookie']!=null)cookie=original.headers['Cookie'];
  return inner.send(request);
 }
 @override void close()=>inner.close();
}
void main(){
 IntegrationTestWidgetsFlutterBinding.ensureInitialized();final key=GlobalKey();
 Future<void> mode(String value,{bool fail=true})async{
  final r=await http.post(Uri.parse('http://127.0.0.1:54796/qa/control'),headers:{'content-type':'application/json'},body:jsonEncode({'mode':value,'fail_logout':fail}));expect(r.statusCode,200);
 }
 Future<void> until(WidgetTester tester,bool Function() predicate)async{
  for(var i=0;i<300&&!predicate();i++){await tester.pump(const Duration(milliseconds:100));await Future<void>.delayed(const Duration(milliseconds:100));}expect(predicate(),true);
 }
 Future<void> shot(WidgetTester tester,String name)async{
  await tester.pumpAndSettle();final boundary=key.currentContext!.findRenderObject()!as RenderRepaintBoundary;final image=await boundary.toImage(pixelRatio:2);final bytes=await image.toByteData(format:ui.ImageByteFormat.png);
  final r=await http.post(Uri.parse('http://127.0.0.1:54801/gestao-native-cog-$name-2026-10-27.png'),headers:{'content-type':'image/png'},body:bytes!.buffer.asUint8List());expect(r.statusCode,201);image.dispose();
 }
 testWidgets('actual Android Chrome, real IDP and Next preserve native staff cookie',(tester)async{
  const email=String.fromEnvironment('TEST_USER_EMAIL'),password=String.fromEnvironment('TEST_USER_PASSWORD');expect(email,isNotEmpty);expect(password,isNotEmpty);
  for(final value in ['valid','unmapped','absent']){
   await mode(value);final transport=QaTransport();final api=ManagementApi(client:transport,cogLogin:CogLogin(issuer:Uri.parse('http://127.0.0.1:54796'),qa:true));
   await api.login('local-$email',password);await api.session();final cookie=transport.cookie;expect(cookie,startsWith('barbacue_admin='));
   await tester.pumpWidget(RepaintBoundary(key:key,child:ManagementApp(key:ValueKey(value),api:api)));
   await until(tester,()=>find.byTooltip('Open navigation menu').evaluate().isNotEmpty);
   await tester.tap(find.byTooltip('Open navigation menu'));await tester.pumpAndSettle();
   final name=value=='valid'?'Pessoa Cog QA':'Pessoa Nativa QA';expect(find.text(name),findsOneWidget);expect(api.usingCog,value=='valid');
   await api.session();expect(transport.cookie,cookie);await shot(tester,value);
   if(value=='valid'){
    expect(find.text('Cardápios'),findsNothing);expect(find.text('Visão geral'),findsWidgets);
    await tester.tap(find.text('Sair da Cog'));await until(tester,()=>find.textContaining('Não foi possível sair da Cog').evaluate().isNotEmpty);
    expect(api.usingCog,true);await shot(tester,'revoke-error');
    await mode('valid',fail:false);await tester.tap(find.text('Tentar novamente'));
    await until(tester,()=>!api.usingCog);
    await tester.pumpAndSettle();await tester.tap(find.byTooltip('Open navigation menu'));await tester.pumpAndSettle();expect(find.text('Pessoa Nativa QA'),findsOneWidget);
    await api.session();expect(transport.cookie,cookie);await shot(tester,'local-restored');
   }
   await tester.pumpWidget(const SizedBox());api.dispose();await tester.pumpAndSettle();
  }
 });
}

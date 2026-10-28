import 'dart:async';
import 'dart:collection';
import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_inappwebview/flutter_inappwebview.dart';
import 'package:path_provider/path_provider.dart';
import 'package:permission_handler/permission_handler.dart';
import 'package:share_plus/share_plus.dart';
import 'package:url_launcher/url_launcher.dart';

import 'management_api.dart';
import 'panel_catalog.dart';
import 'panel_scripts.dart';

/// Full administrative workflows stay in the same application as the web
/// panel. Native operational screens remain available in ManagementApp.
/// This WebView owns an independent private login; no native password, cookie,
/// Cog grant or device key is exposed to JavaScript or passed in a URL.
class ManagementPanel extends StatefulWidget {
  const ManagementPanel({
    super.key,
    required this.origin,
    this.onControllerCreated,
  });
  final Uri origin;
  @visibleForTesting
  final void Function(InAppWebViewController)? onControllerCreated;
  @override
  State<ManagementPanel> createState() => _ManagementPanelState();
}

class _ManagementPanelState extends State<ManagementPanel>
    with WidgetsBindingObserver {
  late final policy = PanelPolicy(widget.origin);
  InAppWebViewController? controller;
  StaffSession? session;
  Uri? current;
  String? error;
  double progress = 0;
  bool ready = false, closing = false, downloading = false, obscured = false;
  int generation = 0;
  int identityRevision = 0;
  Timer? sessionTimer;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    unawaited(prepare());
    sessionTimer = Timer.periodic(const Duration(seconds: 30), (_) {
      if (!obscured) unawaited(readSession());
    });
  }

  Future<void> prepare() async {
    try {
      // WebView cookies belong to this app's sandbox. Customer apps use
      // different bundle IDs. Native ManagementApi keeps its cookies in memory.
      await CookieManager.instance().deleteAllCookies();
      await InAppWebViewController.clearAllCache();
      final directory = Directory(
        '${(await getTemporaryDirectory()).path}/gestao-panel',
      );
      if (await directory.exists()) {
        await for (final entity in directory.list()) {
          if ((await entity.stat()).modified.isBefore(
            DateTime.now().subtract(const Duration(days: 1)),
          )) {
            await entity.delete(recursive: true);
          }
        }
      }
      if (mounted) setState(() => ready = true);
    } catch (_) {
      if (mounted) {
        setState(
          () => error = 'Não foi possível abrir o painel. Tente novamente.',
        );
      }
    }
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (!mounted) return;
    setState(() => obscured = state != AppLifecycleState.resumed);
    if (!obscured) unawaited(readSession());
  }

  @override
  void dispose() {
    generation++;
    identityRevision++;
    sessionTimer?.cancel();
    WidgetsBinding.instance.removeObserver(this);
    // Incognito uses WKWebsiteDataStore.nonPersistent on iOS. Android WebView
    // cookies are also cleared explicitly, including when this route is removed.
    unawaited(
      CookieManager.instance().deleteAllCookies().catchError((_) => false),
    );
    super.dispose();
  }

  Future<bool> trustedPage() async {
    if (!mounted || closing) return false;
    try {
      final url = await controller?.getUrl().timeout(
        const Duration(seconds: 5),
      );
      return mounted && !closing && url != null && policy.internal(url);
    } catch (_) {
      return false;
    }
  }

  Future<void> readSession() async {
    final revision = ++identityRevision;
    if (!await trustedPage()) return;
    try {
      final result = await controller!
          .callAsyncJavaScript(
            functionBody: '''
        if (location.origin !== origin) return null;
        const response = await fetch('/api/admin/auth', {
          credentials: 'same-origin', cache: 'no-store', redirect: 'error',
          headers: {Accept: 'application/json'}
        });
        if (!response.ok) return null;
        const data = await response.json();
        const s = data.session;
        if (!s) return null;
        return {name:s.name, role:s.role, permissions:s.permissions,
          mustChangePassword:s.mustChangePassword};
      ''',
            arguments: {'origin': policy.origin.origin},
          )
          .timeout(const Duration(seconds: 15));
      if (!mounted || closing || revision != identityRevision) return;
      final value = result?.value;
      setState(
        () => session = value is Map
            ? StaffSession(Map<String, dynamic>.from(value))
            : null,
      );
    } catch (_) {
      if (mounted && revision == identityRevision) {
        setState(() => session = null);
      }
    }
  }

  Future<void> navigate(Uri uri) async {
    if (!policy.internal(uri) || closing) return;
    setState(() {
      error = null;
      progress = 0;
      current = uri;
    });
    // Always GET: refresh must never resubmit a form after uncertain delivery.
    await controller?.loadUrl(urlRequest: URLRequest(url: WebUri.uri(uri)));
  }

  Future<NavigationActionPolicy> navigation(NavigationAction action) async {
    final uri = action.request.url;
    if (uri == null) return NavigationActionPolicy.CANCEL;
    if (closing) {
      return uri.toString() == 'about:blank'
          ? NavigationActionPolicy.ALLOW
          : NavigationActionPolicy.CANCEL;
    }
    if (action.isForMainFrame &&
        (policy.internal(uri) || policy.authentication(uri))) {
      return NavigationActionPolicy.ALLOW;
    }
    if (!policy.internal(uri) &&
        policy.external(uri) &&
        userActivated(action)) {
      await openExternal(uri);
      return NavigationActionPolicy.CANCEL;
    }
    if (!action.isForMainFrame) {
      return policy.internal(uri)
          ? NavigationActionPolicy.ALLOW
          : NavigationActionPolicy.CANCEL;
    }
    if (policy.downloadable(uri)) {
      unawaited(download(uri, null));
    } else {
      message('Este endereço não pode ser aberto no painel.');
    }
    return NavigationActionPolicy.CANCEL;
  }

  bool userActivated(NavigationAction action) =>
      action.hasGesture == true ||
      action.navigationType == NavigationType.LINK_ACTIVATED;

  Future<void> openExternal(Uri uri) async {
    try {
      if (!await launchUrl(uri, mode: LaunchMode.externalApplication)) {
        message('Não foi possível abrir este link no aparelho.');
      }
    } catch (_) {
      message('Não foi possível abrir este link no aparelho.');
    }
  }

  void message(String value) {
    if (mounted) {
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text(value)));
    }
  }

  Future<void> closePanel() async {
    if (closing) return;
    if (downloading) {
      message('Aguarde o arquivo terminar ou cancele o compartilhamento.');
      return;
    }
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Sair do painel?'),
        content: const Text(
          'A sessão deste painel será encerrada neste aparelho. Salve as alterações antes de sair.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Continuar'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Sair do painel'),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;
    setState(() {
      closing = true;
      session = null;
    });
    generation++;
    identityRevision++;
    try {
      await controller?.stopLoading();
      await controller?.loadUrl(
        urlRequest: URLRequest(url: WebUri('about:blank')),
      );
      await CookieManager.instance().deleteAllCookies();
      if (mounted) Navigator.pop(context);
    } catch (_) {
      if (mounted) {
        setState(() {
          closing = false;
          error = 'Não foi possível encerrar a sessão. Tente sair novamente.';
        });
      }
    }
  }

  Future<void> back() async {
    if (await controller?.canGoBack() == true) {
      await controller!.goBack();
    } else {
      await closePanel();
    }
  }

  Future<void> chooseModule() async {
    await readSession();
    if (!mounted || session == null) return;
    final available = panelModules
        .where((module) => module.availableTo(session!))
        .toList();
    final chosen = await showModalBottomSheet<PanelModule>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (context) => FractionallySizedBox(
        heightFactor: .88,
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.all(20),
              child: Text(
                'Funções do painel',
                style: Theme.of(context).textTheme.headlineSmall,
              ),
            ),
            Expanded(
              child: ListView(
                children: [
                  for (final group in [
                    'Operação',
                    'Cardápios',
                    'Gestão',
                    'Sistema',
                  ])
                    if (available.any((module) => module.group == group)) ...[
                      Padding(
                        padding: const EdgeInsets.fromLTRB(20, 18, 20, 4),
                        child: Text(
                          group,
                          style: Theme.of(context).textTheme.titleSmall,
                        ),
                      ),
                      for (final module in available.where(
                        (module) => module.group == group,
                      ))
                        ListTile(
                          title: Text(module.title),
                          selected:
                              current != null &&
                              policy.moduleFor(current!) == module,
                          trailing: const Icon(Icons.chevron_right),
                          onTap: () => Navigator.pop(context, module),
                        ),
                    ],
                ],
              ),
            ),
          ],
        ),
      ),
    );
    if (chosen != null && mounted) {
      await navigate(policy.origin.resolve(chosen.path));
    }
  }

  Future<PermissionResponse> mediaPermission(PermissionRequest request) async {
    final camera = PermissionResourceType.CAMERA;
    final microphone = PermissionResourceType.MICROPHONE;
    final denied = PermissionResponse(
      resources: request.resources,
      action: PermissionResponseAction.DENY,
    );
    if (!policy.internal(request.origin) ||
        !await trustedPage() ||
        request.resources.any((r) => r != camera && r != microphone)) {
      return denied;
    }
    if (!mounted) return denied;
    final allowed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Permitir câmera ou microfone?'),
        content: const Text(
          'O painel solicitou acesso para a ação que você iniciou. Você pode recusar.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Recusar'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Permitir'),
          ),
        ],
      ),
    );
    if (allowed != true || !await trustedPage()) return denied;
    // WebKit prompts for OS permission itself. Android needs runtime approval.
    if (Platform.isAndroid) {
      for (final resource in request.resources) {
        final permission = resource == camera
            ? Permission.camera
            : Permission.microphone;
        if (!await permission.request().isGranted) return denied;
      }
    }
    return PermissionResponse(
      resources: request.resources,
      action: PermissionResponseAction.GRANT,
    );
  }

  /// Stream in small chunks inside the authenticated WebView. Cookies never
  /// leave its network stack. This also handles blob: reports/CSV exports and
  /// large private installers without passing credentials to a download app.
  void cancelDownload() {
    generation++;
    setState(() => downloading = false);
  }

  Future<void> download(Uri uri, String? suggestedName) async {
    if (downloading || !policy.downloadable(uri) || !await trustedPage()) {
      return;
    }
    if (!mounted || downloading) return;
    final version = generation;
    setState(() {
      downloading = true;
      progress = 1;
    });
    final key = '__gestaoDownload${DateTime.now().microsecondsSinceEpoch}';
    IOSink? sink;
    File? file;
    try {
      final result = await controller!
          .callAsyncJavaScript(
            functionBody: '''
        if (location.origin !== origin) throw Error('Sessão alterada');
        const response = await fetch(url, {credentials:'same-origin', redirect:'error', cache:'no-store'});
        if (!response.ok) throw Error('Download indisponível');
        const mime = response.headers.get('content-type') || '';
        if (mime.includes('text/html') || mime.includes('application/json')) throw Error('Entre novamente para baixar o arquivo');
        if (Number(response.headers.get('content-length') || 0) > limit) throw Error('Arquivo muito grande');
        if (!response.body) throw Error('Download indisponível neste aparelho');
        window[key] = {reader:response.body.getReader(), pending:null, offset:0};
        return {mime:mime.split(';')[0], disposition:response.headers.get('content-disposition'),
          name:window.__barbacuePanelExportNames?.get(url) || null};
      ''',
            arguments: {
              'origin': policy.origin.origin,
              'url': uri.toString(),
              'key': key,
              'limit': 256 * 1024 * 1024,
            },
          )
          .timeout(const Duration(seconds: 30));
      if (result?.error != null || result?.value is! Map) {
        throw FormatException(
          'Início do arquivo: ${result?.error ?? "resposta ausente"}',
        );
      }
      final meta = Map<String, dynamic>.from(result!.value as Map);
      final disposition = meta['disposition']?.toString() ?? '';
      final match = RegExp(r'''filename="?([^";]+)''').firstMatch(disposition);
      final name = panelFileName(
        meta['name']?.toString() ??
            suggestedName ??
            match?.group(1) ??
            uri.pathSegments.lastOrNull,
      );
      final root = await getTemporaryDirectory();
      final directory = await Directory(
        '${root.path}/gestao-panel/${DateTime.now().microsecondsSinceEpoch}',
      ).create(recursive: true);
      file = File('${directory.path}/$name');
      sink = file.openWrite();
      var size = 0;
      while (mounted && version == generation) {
        if (!await trustedPage()) {
          throw const FormatException('Documento encerrado');
        }
        final chunk = await controller!
            .callAsyncJavaScript(
              functionBody: '''
          if (location.origin !== origin || !window[key]) throw Error('Sessão alterada');
          const stream = window[key];
          if (!stream.pending || stream.offset >= stream.pending.length) {
            const chunk = await stream.reader.read();
            if (chunk.done) return {done:true, bytes:[]};
            stream.pending = chunk.value;
            stream.offset = 0;
          }
          const end = Math.min(stream.offset + 65536, stream.pending.length);
          const bytes = Array.from(stream.pending.subarray(stream.offset, end));
          stream.offset = end;
          return {done:false, bytes};
        ''',
              arguments: {'origin': policy.origin.origin, 'key': key},
            )
            .timeout(const Duration(seconds: 30));
        if (chunk?.error != null || chunk?.value is! Map) {
          throw FormatException(
            'Leitura do arquivo: ${chunk?.error ?? "resposta ausente"}',
          );
        }
        final value = chunk!.value as Map;
        if (value['done'] == true) break;
        // WebKit bridges JavaScript numbers as doubles; Android uses ints.
        final bytes = (value['bytes'] as List)
            .map((byte) {
              if (byte is! num ||
                  !byte.isFinite ||
                  byte < 0 ||
                  byte > 255 ||
                  byte % 1 != 0) {
                throw const FormatException('Conteúdo do arquivo inválido');
              }
              return byte.toInt();
            })
            .toList(growable: false);
        size += bytes.length;
        if (size > 256 * 1024 * 1024) throw const FormatException();
        sink.add(bytes);
        await sink.flush();
      }
      await sink.close();
      sink = null;
      if (!mounted || version != generation) {
        await file.delete();
        return;
      }
      final box = context.findRenderObject() as RenderBox?;
      await SharePlus.instance.share(
        ShareParams(
          files: [XFile(file.path, mimeType: meta['mime']?.toString())],
          sharePositionOrigin: box == null
              ? null
              : box.localToGlobal(Offset.zero) & box.size,
        ),
      );
    } catch (failure) {
      try {
        await sink?.close();
      } catch (_) {
        /* failed writer */
      }
      sink = null;
      try {
        if (file != null && await file.exists()) await file.delete();
      } catch (_) {
        /* cleanup on next opening */
      }
      if (mounted && version == generation) {
        assert(() {
          debugPrint('Falha no download do painel: $failure');
          return true;
        }());
        message(
          'Não foi possível baixar o arquivo. Confira a conexão e sua sessão e tente novamente.',
        );
      }
    } finally {
      try {
        await sink?.close();
      } catch (_) {
        /* failed writer */
      }
      if (mounted) {
        try {
          await controller?.callAsyncJavaScript(
            functionBody: '''
            if (window[key]) { await window[key].reader.cancel(); delete window[key]; }
          ''',
            arguments: {'key': key},
          );
        } catch (_) {
          /* document may have navigated */
        }
        if (mounted && version == generation) {
          setState(() => downloading = false);
        }
      }
    }
  }

  @override
  Widget build(BuildContext context) => PopScope(
    canPop: closing,
    onPopInvokedWithResult: (didPop, result) {
      if (!didPop) unawaited(back());
    },
    child: Scaffold(
      appBar: AppBar(
        leading: IconButton(
          tooltip: 'Voltar',
          onPressed: closing ? null : back,
          icon: const Icon(Icons.arrow_back),
        ),
        title: const Text(
          'Painel de controle',
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
        ),
        actions: [
          IconButton(
            tooltip: 'Funções do painel',
            onPressed:
                session == null || session!.mustChangePassword || downloading
                ? null
                : chooseModule,
            icon: const Icon(Icons.apps),
          ),
          PopupMenuButton<String>(
            tooltip: 'Mais opções',
            onSelected: (value) async {
              if (value == 'refresh') {
                if (ready) {
                  await navigate(
                    current ?? policy.origin.resolve('/admin/workspace'),
                  );
                } else {
                  await prepare();
                }
              }
              if (value == 'print' && await trustedPage()) {
                try {
                  await controller?.printCurrentPage();
                } catch (_) {
                  message('Não foi possível abrir a impressão neste aparelho.');
                }
              }
              if (value == 'exit') await closePanel();
            },
            itemBuilder: (_) => [
              const PopupMenuItem(value: 'refresh', child: Text('Atualizar')),
              if (session != null)
                const PopupMenuItem(
                  value: 'print',
                  child: Text('Imprimir / salvar PDF'),
                ),
              const PopupMenuItem(value: 'exit', child: Text('Sair do painel')),
            ],
          ),
        ],
      ),
      body: SafeArea(
        child: Stack(
          children: [
            Column(
              children: [
                if (progress < 1 || downloading)
                  LinearProgressIndicator(value: downloading ? null : progress),
                if (downloading)
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 12),
                    child: Row(
                      children: [
                        const Expanded(child: Text('Preparando arquivo…')),
                        TextButton(
                          onPressed: cancelDownload,
                          child: const Text('Cancelar'),
                        ),
                      ],
                    ),
                  ),
                Expanded(
                  child: ready
                      ? InAppWebView(
                          initialUserScripts: UnmodifiableListView([
                            UserScript(
                              source:
                                  'if (location.origin === ${jsonEncode(policy.origin.origin)}) { $panelExportCompatibilityScript }',
                              injectionTime:
                                  UserScriptInjectionTime.AT_DOCUMENT_START,
                              forMainFrameOnly: true,
                            ),
                          ]),
                          initialUrlRequest: URLRequest(
                            url: WebUri.uri(
                              policy.origin.resolve('/admin/workspace'),
                            ),
                          ),
                          initialSettings: InAppWebViewSettings(
                            incognito: true,
                            cacheEnabled: false,
                            clearCache: true,
                            javaScriptEnabled: true,
                            javaScriptCanOpenWindowsAutomatically: false,
                            supportMultipleWindows: true,
                            useShouldOverrideUrlLoading: true,
                            useOnDownloadStart: true,
                            useOnNavigationResponse: true,
                            thirdPartyCookiesEnabled: false,
                            allowFileAccess: false,
                            allowContentAccess: false,
                            allowFileAccessFromFileURLs: false,
                            allowUniversalAccessFromFileURLs: false,
                            mixedContentMode:
                                MixedContentMode.MIXED_CONTENT_NEVER_ALLOW,
                            isInspectable: false,
                            safeBrowsingEnabled: true,
                            allowsInlineMediaPlayback: true,
                            mediaPlaybackRequiresUserGesture: true,
                            applicationNameForUserAgent: 'BarbacueGestao/1.1',
                          ),
                          onWebViewCreated: (value) {
                            controller = value;
                            value.addJavaScriptHandler(
                              handlerName: 'barbacueExport',
                              callback: (arguments) async {
                                if (arguments.length != 1 ||
                                    arguments.single is! String ||
                                    (arguments.single as String).length >
                                        2048 ||
                                    !await trustedPage()) {
                                  return false;
                                }
                                final uri = Uri.tryParse(
                                  arguments.single as String,
                                );
                                if (uri == null ||
                                    uri.scheme != 'blob' ||
                                    !policy.downloadable(uri)) {
                                  return false;
                                }
                                final tracked = await value.callAsyncJavaScript(
                                  functionBody:
                                      'return location.origin === origin && window.__barbacuePanelExportNames?.has(url) === true;',
                                  arguments: {
                                    'origin': policy.origin.origin,
                                    'url': uri.toString(),
                                  },
                                );
                                if (tracked?.value != true) return false;
                                await download(uri, null);
                                return true;
                              },
                            );
                            widget.onControllerCreated?.call(value);
                          },
                          shouldOverrideUrlLoading: (_, action) =>
                              navigation(action),
                          onNavigationResponse: (_, navigation) async {
                            final response = navigation.response;
                            final uri = response?.url;
                            final disposition =
                                response?.headers?.entries
                                    .where(
                                      (e) =>
                                          e.key.toLowerCase() ==
                                          'content-disposition',
                                    )
                                    .map((e) => e.value.toLowerCase())
                                    .join() ??
                                '';
                            // WebKit can render text/csv, even when the server
                            // marks it as an attachment. Keep the current page
                            // and download it through its authenticated session.
                            if (navigation.isForMainFrame &&
                                uri != null &&
                                policy.downloadable(uri) &&
                                (disposition.startsWith('attachment') ||
                                    !navigation.canShowMIMEType)) {
                              return NavigationResponseAction.DOWNLOAD;
                            }
                            return NavigationResponseAction.ALLOW;
                          },
                          onCreateWindow: (_, action) async {
                            final url = action.request.url;
                            if (url != null) {
                              if (policy.internal(url)) {
                                await navigate(url);
                              } else if (policy.external(url) &&
                                  userActivated(action)) {
                                await openExternal(url);
                              }
                            }
                            return false;
                          },
                          onLoadStart: (_, url) {
                            if (mounted) {
                              setState(() {
                                error = null;
                                session = null;
                                identityRevision++;
                                current = url;
                                progress = 0;
                              });
                            }
                          },
                          onProgressChanged: (_, value) {
                            if (mounted) setState(() => progress = value / 100);
                          },
                          onLoadStop: (value, url) async {
                            if (mounted) {
                              setState(() {
                                current = url;
                                progress = 1;
                              });
                            }
                            if (url != null &&
                                policy.internal(url) &&
                                !closing) {
                              try {
                                await value.evaluateJavascript(
                                  source:
                                      'if (location.origin === ${jsonEncode(policy.origin.origin)}) { $panelExportCompatibilityScript }',
                                );
                              } catch (_) {
                                /* document may have navigated */
                              }
                            }
                            await readSession();
                          },
                          onUpdateVisitedHistory: (_, url, _) {
                            if (mounted) {
                              setState(() {
                                current = url;
                                session = null;
                              });
                            }
                            unawaited(readSession());
                          },
                          onReceivedError: (_, request, failure) {
                            if (failure.type ==
                                    WebResourceErrorType.CANCELLED ||
                                failure.description.contains(
                                  'domain=WebKitErrorDomain, code=102',
                                )) {
                              return;
                            }
                            if (mounted && request.isForMainFrame != false) {
                              setState(() {
                                error =
                                    'Sem conexão com o painel. Verifique sua internet e tente novamente.';
                                progress = 1;
                              });
                            }
                          },
                          onReceivedHttpError: (_, request, response) {
                            if (mounted &&
                                request.isForMainFrame == true &&
                                (response.statusCode ?? 0) >= 400) {
                              setState(() {
                                error =
                                    'O painel não pôde abrir esta página. Atualize ou escolha outra função.';
                                progress = 1;
                              });
                            }
                          },
                          onPermissionRequest: (_, request) =>
                              mediaPermission(request),
                          onDownloadStartRequest: (_, request) => unawaited(
                            download(request.url, request.suggestedFilename),
                          ),
                          onPrintRequest: (_, _, _) async => false,
                        )
                      : const Center(child: CircularProgressIndicator()),
                ),
              ],
            ),
            if (error != null)
              Positioned.fill(
                child: ColoredBox(
                  color: Theme.of(context).colorScheme.surface,
                  child: Center(
                    child: Padding(
                      padding: const EdgeInsets.all(24),
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          const Icon(Icons.cloud_off_outlined, size: 40),
                          const SizedBox(height: 16),
                          Text(error!, textAlign: TextAlign.center),
                          const SizedBox(height: 16),
                          FilledButton(
                            onPressed: () async {
                              if (ready) {
                                await navigate(
                                  current ??
                                      policy.origin.resolve('/admin/workspace'),
                                );
                              } else {
                                setState(() => error = null);
                                await prepare();
                              }
                            },
                            child: const Text('Tentar novamente'),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
            if (obscured || closing)
              const Positioned.fill(
                child: ColoredBox(
                  color: Color(0xFFF3F5F7),
                  child: Center(child: Text('Barbacue Gestão')),
                ),
              ),
          ],
        ),
      ),
    ),
  );
}

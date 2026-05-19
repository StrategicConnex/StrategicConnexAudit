import { ToolExecutor } from "../types/executor.types";
import { dnsLookupExecutor, dnsMxExecutor, dnsTxtExecutor, dnsNsExecutor } from "../executors/dns-executors";
import { emailSpfExecutor, emailDmarcExecutor, emailDkimExecutor } from "../executors/email-executors";
import {
  networkPingExecutor,
  networkReverseDnsExecutor,
  networkGeoIpExecutor,
  networkTracerouteExecutor
} from "../executors/network-executors";
import {
  websiteHeadersExecutor,
  websiteSecurityHeadersExecutor,
  websiteTlsExecutor,
  websiteRobotsExecutor
} from "../executors/website-executors";
import { osintWhoisExecutor } from "../executors/osint-executors";

export const executorRegistry: Record<string, ToolExecutor> = {
  "dns.lookup": dnsLookupExecutor,
  "dns.mx": dnsMxExecutor,
  "dns.txt": dnsTxtExecutor,
  "dns.ns": dnsNsExecutor,
  "email.spf": emailSpfExecutor,
  "email.dmarc": emailDmarcExecutor,
  "email.dkim": emailDkimExecutor,
  "network.ping": networkPingExecutor,
  "network.reverse_dns": networkReverseDnsExecutor,
  "network.geoip": networkGeoIpExecutor,
  "network.traceroute": networkTracerouteExecutor,
  "website.headers": websiteHeadersExecutor,
  "website.security_headers": websiteSecurityHeadersExecutor,
  "tls.scan": websiteTlsExecutor,
  "website.robots": websiteRobotsExecutor,
  "osint.whois": osintWhoisExecutor,
};

export function getExecutor(toolId: string): ToolExecutor | undefined {
  return executorRegistry[toolId];
}

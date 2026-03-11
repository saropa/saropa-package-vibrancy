import json
import os
import urllib.request
import time

def get_package_license(package_name):
    """Fetches the SPDX license identifier from the pub.dev metrics endpoint."""
    try:
        url = f"https://pub.dev/api/packages/{package_name}/metrics"
        req = urllib.request.Request(url, headers={'User-Agent': 'SaropaLicenseBot/1.0'})
        
        with urllib.request.urlopen(req) as response:
            if response.status != 200:
                return "Unknown"
            
            data = json.loads(response.read().decode('utf-8'))
            
            # Attempt 1: Get the exact SPDX identifier from the package analyzer (pana) report
            try:
                licenses = data['scorecard']['panaReport']['licenses']
                if licenses and len(licenses) > 0:
                    return licenses[0].get('spdxIdentifier', 'Unknown')
            except KeyError:
                pass
            
            # Attempt 2: Fallback to the tags field which contains license tags
            try:
                tags = data['score']['tags']
                for tag in tags:
                    if tag.startswith('license:'):
                        return tag.split(':')[1].upper()
            except KeyError:
                pass

            return "Unknown"

    except urllib.error.HTTPError:
        # Fails silently if the package is deleted or isn't on pub.dev
        return "Not Found"
    except Exception:
        return "Error"

def main():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    input_file = os.path.join(script_dir, 'known_issues.json')
    output_file = os.path.join(script_dir, 'known_issues_updated.json')

    if not os.path.exists(input_file):
        print(f"Error: Could not find {input_file}")
        return

    with open(input_file, 'r', encoding='utf-8') as f:
        data = json.load(f)

    issues = data.get('issues', [])
    print(f"Fetching license data from pub.dev for {len(issues)} packages...\n")

    for issue in issues:
        raw_name = issue.get('name')
        if not raw_name:
            continue
        
        # Clean up names like "Hive (v1/v2)" to get the raw pub.dev name
        clean_name = raw_name.split(' (')[0].split('_v')[0].strip().lower()
        
        print(f"Checking {clean_name}...", end=" ", flush=True)
        pkg_license = get_package_license(clean_name)
        
        # Inject the real license data
        issue['license'] = pkg_license
        print(f"[{pkg_license}]")
        
        # Sleep for 300ms to avoid rate-limiting
        time.sleep(0.3)

    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

    print(f"\n✅ Done! Actual licenses written to {output_file}")

if __name__ == "__main__":
    main()